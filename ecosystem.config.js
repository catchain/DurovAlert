module.exports = {
  apps: [{
    name: 'DurovAlert',
    script: 'DurovAlert.js',
    
    // Перезапуск при ошибках
    autorestart: true,
    
    // Максимум 3 перезапуска в минуту
    max_restarts: 3,
    min_uptime: '1m',
    
    // Логирование
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    
    // Переменные окружения
    env: {
      NODE_ENV: 'production'
    },
    
    // Настройки мониторинга
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Остановка при множественных ошибках
    stop_exit_codes: [0]
  }]
}; 