import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppState } from '../../shared/types';

export const appRoot = path.resolve(import.meta.dirname, '../..');

export class DesktopHarness {
  app?: ElectronApplication;
  page!: Page;
  readonly consoleErrors: string[] = [];
  private constructor(readonly temporaryRoot: string, readonly projectPath?: string) {}

  static async create(project?: 'clean' | 'fault') {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'jaxos-e2e-'));
    let projectPath: string | undefined;
    if (project) {
      const projectDirectory = path.join(temporaryRoot, 'KiCad project with spaces');
      await cp(path.join(appRoot, 'tests/fixtures/kicad', project), projectDirectory, { recursive: true });
      projectPath = path.join(projectDirectory, 'two-pin-link.kicad_pro');
    }
    await Promise.all([
      mkdir(path.join(temporaryRoot, 'exports'), { recursive: true }),
      mkdir(path.join(temporaryRoot, 'data'), { recursive: true }),
    ]);
    return new DesktopHarness(temporaryRoot, projectPath);
  }

  async launch(applicationPath = appRoot) {
    this.consoleErrors.length = 0;
    this.app = await electron.launch({
      args: [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), applicationPath],
      cwd: appRoot,
      env: {
        ...process.env,
        JAXOS_TEST_MODE: '1',
        JAXOS_DATA_DIR: path.join(this.temporaryRoot, 'data'),
        JAXOS_TEST_PROJECT: this.projectPath || '',
        JAXOS_TEST_EXPORT_DIR: path.join(this.temporaryRoot, 'exports'),
        JAXOS_TEST_KICAD_PATH: process.env.JAXOS_TEST_KICAD_PATH || '',
      },
      timeout: 30_000,
    });
    this.page = await this.app.firstWindow();
    this.page.on('pageerror', error => this.consoleErrors.push(error.message));
    await this.page.waitForFunction(() => !!window.jaxos);
    if (process.env.JAXOS_TEST_KICAD_PATH) {
      await this.page.evaluate(() => window.jaxos.chooseKiCad());
      await this.page.reload();
      await this.page.waitForFunction(() => !!window.jaxos);
    }
    return this.page;
  }

  async state(): Promise<AppState> { return this.page.evaluate(() => window.jaxos.getState()); }

  async restart() {
    await this.app?.close();
    this.app = undefined;
    return this.launch();
  }

  async dispose() {
    await this.app?.close();
    this.app = undefined;
    await rm(this.temporaryRoot, { recursive: true, force: true });
  }
}
