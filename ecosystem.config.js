module.exports = {
  apps: [{
    name: "study",
    cwd: "/opt/ai-student-study",
    script: "npx",
    args: "next start -p 3002",
    env_file: ".env",
    max_restarts: 10,
    restart_delay: 3000
  }]
};
