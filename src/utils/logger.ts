import winston from 'winston';

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor(environment: string) {
    this.logger = winston.createLogger({
      level: environment === 'development' ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'combined.log' 
        })
      ]
    });
  }

  static getInstance(environment: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(environment);
    }
    return Logger.instance;
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }
}