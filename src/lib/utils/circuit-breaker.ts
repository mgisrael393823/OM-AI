/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by temporarily disabling calls to failing services.
 * Implements the three states: Closed, Open, and Half-Open with configurable thresholds.
 */

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures to trigger open state
  recoveryTimeout: number;       // Time in ms before attempting recovery (half-open)
  monitoringPeriod: number;      // Time window in ms for tracking failures
  successThreshold: number;      // Successes needed in half-open to close
  expectedErrors: string[];      // Error patterns that should trigger the breaker
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateChangeTime: Date;
  failureRate: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public state: CircuitBreakerState,
    public lastFailureTime?: Date
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private stateChangeTime: Date = new Date();
  private recentFailures: Date[] = [];

  constructor(
    private config: CircuitBreakerConfig,
    private name: string = 'circuit-breaker'
  ) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit breaker should open
    this.updateState();
    
    if (this.state === 'open') {
      const timeSinceLastFailure = this.lastFailureTime 
        ? Date.now() - this.lastFailureTime.getTime()
        : 0;
        
      throw new CircuitBreakerError(
        `Circuit breaker is OPEN for ${this.name}. Last failure: ${timeSinceLastFailure}ms ago`,
        this.state,
        this.lastFailureTime
      );
    }

    this.totalRequests++;
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = new Date();
    
    // If we're in half-open state and have enough successes, close the circuit
    if (this.state === 'half-open' && this.successes >= this.config.successThreshold) {
      this.closeCircuit();
    }
    
    console.debug(`Circuit breaker ${this.name}: Success recorded`, {
      state: this.state,
      successes: this.successes,
      failures: this.failures
    });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    // Only count failures that match expected error patterns
    if (!this.isExpectedError(error)) {
      console.debug(`Circuit breaker ${this.name}: Ignored non-expected error`, {
        error: error.message,
        type: error.constructor.name
      });
      return;
    }

    this.failures++;
    this.lastFailureTime = new Date();
    this.recentFailures.push(new Date());
    
    // Clean up old failures outside monitoring period
    this.cleanupOldFailures();
    
    console.warn(`Circuit breaker ${this.name}: Failure recorded`, {
      state: this.state,
      failures: this.failures,
      recentFailures: this.recentFailures.length,
      error: error.message
    });

    // Open circuit if failure threshold is reached
    if (this.state === 'closed' && this.recentFailures.length >= this.config.failureThreshold) {
      this.openCircuit();
    } else if (this.state === 'half-open') {
      // Go back to open state on any failure during half-open
      this.openCircuit();
    }
  }

  /**
   * Update circuit breaker state based on time and conditions
   */
  private updateState(): void {
    const now = Date.now();
    
    if (this.state === 'open' && this.lastFailureTime) {
      const timeSinceLastFailure = now - this.lastFailureTime.getTime();
      
      // Move to half-open after recovery timeout
      if (timeSinceLastFailure >= this.config.recoveryTimeout) {
        this.halfOpenCircuit();
      }
    }
    
    // Clean up old failures
    this.cleanupOldFailures();
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = 'open';
    this.stateChangeTime = new Date();
    this.successes = 0; // Reset success counter
    
    console.error(`Circuit breaker ${this.name} OPENED`, {
      failures: this.failures,
      recentFailures: this.recentFailures.length,
      threshold: this.config.failureThreshold,
      recoveryTimeout: this.config.recoveryTimeout
    });
  }

  /**
   * Move to half-open state
   */
  private halfOpenCircuit(): void {
    this.state = 'half-open';
    this.stateChangeTime = new Date();
    this.successes = 0; // Reset success counter for half-open evaluation
    
    console.info(`Circuit breaker ${this.name} moved to HALF-OPEN`, {
      timeSinceOpen: Date.now() - this.stateChangeTime.getTime(),
      successThreshold: this.config.successThreshold
    });
  }

  /**
   * Close the circuit breaker (normal operation)
   */
  private closeCircuit(): void {
    this.state = 'closed';
    this.stateChangeTime = new Date();
    this.failures = 0;
    this.successes = 0;
    this.recentFailures = [];
    
    console.info(`Circuit breaker ${this.name} CLOSED (recovered)`, {
      totalRequests: this.totalRequests
    });
  }

  /**
   * Check if error should trigger circuit breaker
   */
  private isExpectedError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();
    
    return this.config.expectedErrors.some(pattern =>
      errorMessage.includes(pattern.toLowerCase()) ||
      errorName.includes(pattern.toLowerCase())
    );
  }

  /**
   * Remove failures outside the monitoring period
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    this.recentFailures = this.recentFailures.filter(
      failureTime => failureTime.getTime() > cutoff
    );
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    this.updateState(); // Ensure state is current
    
    const failureRate = this.totalRequests > 0 
      ? (this.failures / this.totalRequests) * 100 
      : 0;

    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangeTime: this.stateChangeTime,
      failureRate: Math.round(failureRate * 100) / 100
    };
  }

  /**
   * Force circuit breaker to specific state (for testing)
   */
  forceState(state: CircuitBreakerState): void {
    console.warn(`Circuit breaker ${this.name} state forced to ${state}`);
    this.state = state;
    this.stateChangeTime = new Date();
    
    if (state === 'closed') {
      this.failures = 0;
      this.successes = 0;
      this.recentFailures = [];
    }
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    console.info(`Circuit breaker ${this.name} reset`);
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.stateChangeTime = new Date();
    this.recentFailures = [];
  }

  /**
   * Check if circuit breaker is allowing requests
   */
  isCallAllowed(): boolean {
    this.updateState();
    return this.state !== 'open';
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    const metrics = this.getMetrics();
    const timeSinceStateChange = Date.now() - metrics.stateChangeTime.getTime();
    
    switch (metrics.state) {
      case 'closed':
        return `CLOSED - ${metrics.totalRequests} requests, ${metrics.failures} failures (${metrics.failureRate}%)`;
      case 'open':
        return `OPEN - Blocked for ${Math.round(timeSinceStateChange / 1000)}s, recovers in ${Math.max(0, Math.round((this.config.recoveryTimeout - timeSinceStateChange) / 1000))}s`;
      case 'half-open':
        return `HALF-OPEN - Testing recovery, ${metrics.successes}/${this.config.successThreshold} successes needed`;
      default:
        return `UNKNOWN STATE: ${metrics.state}`;
    }
  }
}

/**
 * Circuit breaker manager for multiple services
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = {
      failureThreshold: 5,
      recoveryTimeout: 30000,      // 30 seconds
      monitoringPeriod: 60000,     // 1 minute
      successThreshold: 3,
      expectedErrors: [
        'timeout',
        'rate_limit_exceeded',
        'server_error',
        'service_unavailable',
        'model_overloaded',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND'
      ],
      ...defaultConfig
    };
  }

  /**
   * Get or create circuit breaker for a service
   */
  getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      this.breakers.set(serviceName, new CircuitBreaker(finalConfig, serviceName));
    }
    return this.breakers.get(serviceName)!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(serviceName: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(serviceName);
    return breaker.execute(operation);
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Get status summary for all circuit breakers
   */
  getStatusSummary(): Record<string, string> {
    const status: Record<string, string> = {};
    
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    console.info('Resetting all circuit breakers');
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Check overall system health based on circuit breaker states
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    openBreakers: string[];
    halfOpenBreakers: string[];
    totalBreakers: number;
  } {
    const allMetrics = this.getAllMetrics();
    const openBreakers: string[] = [];
    const halfOpenBreakers: string[] = [];
    
    for (const [name, metrics] of Object.entries(allMetrics)) {
      if (metrics.state === 'open') {
        openBreakers.push(name);
      } else if (metrics.state === 'half-open') {
        halfOpenBreakers.push(name);
      }
    }
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (openBreakers.length === 0 && halfOpenBreakers.length === 0) {
      status = 'healthy';
    } else if (openBreakers.length === 0) {
      status = 'degraded'; // Only half-open breakers
    } else {
      status = 'unhealthy'; // At least one open breaker
    }
    
    return {
      status,
      openBreakers,
      halfOpenBreakers,
      totalBreakers: this.breakers.size
    };
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();

// Convenience function for OpenAI service
export const openAICircuitBreaker = circuitBreakerManager.getBreaker('openai', {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  monitoringPeriod: 60000,
  successThreshold: 2,
  expectedErrors: [
    'rate_limit_exceeded',
    'model_overloaded',
    'server_error',
    'service_unavailable',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT'
  ]
});