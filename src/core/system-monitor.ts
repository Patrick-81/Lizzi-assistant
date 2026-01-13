// src/core/system-monitor.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemStats {
  vram: {
    used: number;
    total: number;
    percentage: number;
    unit: string;
  };
  ram: {
    used: number;
    total: number;
    percentage: number;
  };
  process: {
    heapUsed: number;
    heapTotal: number;
  };
}

export class SystemMonitor {
  private gpuAvailable: boolean = false;

  constructor() {
    this.checkGPU();
  }

  private async checkGPU() {
    try {
      await execAsync('nvidia-smi');
      this.gpuAvailable = true;
    } catch {
      this.gpuAvailable = false;
      console.log('⚠️  GPU NVIDIA non détecté, monitoring VRAM désactivé');
    }
  }

  async getStats(): Promise<SystemStats> {
    const [vramStats, ramStats] = await Promise.all([
      this.getVRAMStats(),
      this.getRAMStats()
    ]);

    const memUsage = process.memoryUsage();

    return {
      vram: vramStats,
      ram: ramStats,
      process: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    };
  }

  private async getVRAMStats() {
    if (!this.gpuAvailable) {
      return {
        used: 0,
        total: 0,
        percentage: 0,
        unit: 'MiB'
      };
    }

    try {
      // Récupère la mémoire utilisée et totale via nvidia-smi
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits'
      );

      const [used, total] = stdout.trim().split(',').map(s => parseInt(s.trim()));
      const percentage = Math.round((used / total) * 100);

      return {
        used,
        total,
        percentage,
        unit: 'MiB'
      };
    } catch (error) {
      console.error('Erreur lecture VRAM:', error);
      return {
        used: 0,
        total: 0,
        percentage: 0,
        unit: 'MiB'
      };
    }
  }

  private async getRAMStats() {
    try {
      // Pour Linux
      const { stdout: memInfo } = await execAsync('cat /proc/meminfo');

      const lines = memInfo.split('\n');
      const memTotal = parseInt(lines.find(l => l.startsWith('MemTotal'))?.split(/\s+/)[1] || '0');
      const memAvailable = parseInt(lines.find(l => l.startsWith('MemAvailable'))?.split(/\s+/)[1] || '0');

      const totalMB = Math.round(memTotal / 1024);
      const usedMB = Math.round((memTotal - memAvailable) / 1024);
      const percentage = Math.round((usedMB / totalMB) * 100);

      return {
        used: usedMB,
        total: totalMB,
        percentage
      };
    } catch (error) {
      console.error('Erreur lecture RAM:', error);
      return {
        used: 0,
        total: 0,
        percentage: 0
      };
    }
  }

  async getModelInfo(): Promise<{ name: string; size: string }> {
    const modelName = process.env.MODEL_NAME || 'unknown';

    // Estimation de la taille selon les modèles connus
    const modelSizes: Record<string, string> = {
      'ministral-3:8b': '~6 GB',
      'qwen2.5:14b': '~8 GB',
      'llama3.1:8b': '~5 GB',
      'mistral': '~4 GB'
    };

    return {
      name: modelName,
      size: modelSizes[modelName] || 'N/A'
    };
  }
}
