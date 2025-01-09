export interface ServiceStatus {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: Date;
    details?: any;
  }
  
  export interface SystemMetrics {
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
    uptime: number;
    timestamp: Date;
  }
  
  export interface TransactionMonitorConfig {
    checkInterval: number;
    minConfirmations: {
      eth: number;
      sol: number;
      btc: number;
    };
  }
  
  export interface MonitoredTransaction {
    chain: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    confirmations: number;
    status: 'pending' | 'confirmed' | 'failed';
  }