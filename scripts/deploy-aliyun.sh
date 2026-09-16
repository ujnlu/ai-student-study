#!/bin/bash
# 一键部署到阿里云 ECS（在开发机上运行）：
#   npm run deploy               本机构建 → rsync 源码 + .next 产物 → 线上 npm ci（仅依赖变化时）→ prisma migrate deploy → pm2 restart
#   npm run deploy -- --db       另外把本机数据库快照 + 上传文件同步过去（覆盖线上库；覆盖前自动备份到 /opt/backup）
#   npm run deploy -- --textbooks  同步完成后在线上后台补拉教材页面图片（本机新导入教材后使用）
#   npm run deploy -- --remote-build  改回在线上机器构建（ECS 只有 3.5G 内存，next build 会把机器拖到 ssh 无响应，不推荐）
# 本机构建在 /tmp/study-build 副本里进行（node_modules 用硬链接复制，Turbopack 不接受指向项目外的软链接），不会碰开发服务器的 .next。
set -euo pipefail
HOST=${DEPLOY_HOST:-root@123.56.92.161}
DIR=${DEPLOY_DIR:-/opt/ai-student-study}
WITH_DB=0; WITH_TB=0; REMOTE_BUILD=0
for a in "$@"; do case "$a" in --db) WITH_DB=1;; --textbooks) WITH_TB=1;; --remote-build) REMOTE_BUILD=1;; *) echo "未知参数 $a"; exit 1;; esac; done
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$REMOTE_BUILD" = 0 ]; then
  step "本机构建（/tmp/study-build 副本）"
  BUILD=/tmp/study-build
  mkdir -p "$BUILD"
  rsync -a --delete --exclude node_modules --exclude .next --exclude data --exclude .git --exclude '*.log' --exclude '*.tmp.ts' --exclude 'scripts/.*' ./ "$BUILD/"
  if [ ! -d "$BUILD/node_modules" ] || [ package-lock.json -nt "$BUILD/node_modules/.package-lock.json" ]; then
    rm -rf "$BUILD/node_modules"
    cp -al node_modules "$BUILD/node_modules" 2>/dev/null || cp -a node_modules "$BUILD/node_modules"
  fi
  [ -e "$BUILD/data" ] || ln -s "$PWD/data" "$BUILD/data"
  cp .env "$BUILD/.env"
  rm -rf "$BUILD/.next"
  (cd "$BUILD" && NODE_OPTIONS=--max-old-space-size=3072 npm run build 2>&1 | grep -E "Compiled|error|Error|✓|✗|warn" | tail -8)
  [ -f "$BUILD/.next/BUILD_ID" ] || { echo "本机构建失败，没有生成 .next/BUILD_ID"; exit 1; }
fi

step "同步源码到 $HOST:$DIR"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude data --exclude .git --exclude '*.tmp.ts' --exclude 'scripts/.*' \
  ./ "$HOST:$DIR/"

if [ "$REMOTE_BUILD" = 0 ]; then
  step "同步构建产物 .next（不含 cache）"
  rsync -az --delete --exclude cache "$BUILD/.next/" "$HOST:$DIR/.next/"
fi

if [ "$WITH_DB" = 1 ]; then
  step "生成本机数据库一致性快照"
  node -e '
    const D = require("better-sqlite3");
    const d = new D("data/dev.db", { readonly: true });
    d.backup("/tmp/deploy-db.db").then(() => { d.close(); console.log("snapshot ok"); });
  '
  step "上传数据库快照与上传文件"
  rsync -az /tmp/deploy-db.db "$HOST:$DIR/data/dev.db.new"
  rsync -az data/uploads "$HOST:$DIR/data/"
  rm -f /tmp/deploy-db.db
fi

step "线上：安装依赖、迁移、构建、重启"
ssh "$HOST" bash -s "$WITH_DB" "$WITH_TB" "$DIR" "$REMOTE_BUILD" <<'REMOTE'
set -euo pipefail
WITH_DB=$1; WITH_TB=$2; DIR=$3; REMOTE_BUILD=$4
cd "$DIR"
if [ "$WITH_DB" = 1 ] && [ -f data/dev.db.new ]; then
  echo "停止服务并替换数据库（旧库备份到 /opt/backup）"
  pm2 stop study >/dev/null 2>&1 || true
  mkdir -p /opt/backup
  cp data/dev.db "/opt/backup/dev-pre-deploy-$(date +%F-%H%M%S).db"
  rm -f data/dev.db-wal data/dev.db-shm
  mv data/dev.db.new data/dev.db
fi
# 依赖没变就跳过 npm ci（线上内存小，能省则省）
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund 2>&1 | tail -1
else
  echo "依赖未变化，跳过 npm ci"
fi
npx prisma generate 2>&1 | grep -E "Generated|error" || true
npx prisma migrate deploy 2>&1 | grep -vE "^\s*$|Prisma schema|Datasource|Loaded" | tail -3
if [ "$REMOTE_BUILD" = 1 ]; then
  # 小内存机器：先停应用、限制堆 1.5G、低优先级，避免构建把 sshd/nginx 一起拖死；首次部署请先运行 scripts/ecs-first-setup.sh 建 swap
  pm2 stop study >/dev/null 2>&1 || true
  NODE_OPTIONS=--max-old-space-size=1536 nice -n 15 npm run build 2>&1 | grep -E "Compiled|error|Error|✓|✗" | tail -5
fi
[ -f .next/BUILD_ID ] || { echo "没有构建产物 .next/BUILD_ID，放弃重启"; exit 1; }
pm2 restart study --update-env >/dev/null 2>&1 || pm2 start npm --name study --cwd "$DIR" -- start -- -p 3002 >/dev/null
pm2 save >/dev/null
sleep 4
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/login)
echo "健康检查 /login -> $code"
[ "$code" = 200 ] || { pm2 logs study --lines 20 --nostream; exit 1; }
if [ "$WITH_TB" = 1 ]; then
  echo "后台补拉教材页面图片，日志：$DIR/data/refetch.log"
  setsid nohup npx tsx scripts/refetch-textbook-images.ts 8 > data/refetch.log 2>&1 < /dev/null &
fi
REMOTE
step "完成：http://${HOST#*@}/"
