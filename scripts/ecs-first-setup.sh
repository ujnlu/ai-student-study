#!/bin/bash
# 在 ECS 上执行一次：为小内存机器加 4G swap，并把内核倾向调成少用 swap（只在内存快满时兜底，避免构建时把整机拖死）
set -euo pipefail
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
free -h | sed -n '2p;3p'
