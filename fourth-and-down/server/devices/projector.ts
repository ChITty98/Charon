// Epson PowerLite Home Cinema 5030UB — RS-232 control stub
// Requires USB-to-RS-232 adapter and serialport npm package
// Not implementing in Phase 1-2; projector powers on via HDMI signal

export class EpsonProjector {
  private port: string;

  constructor(port: string) {
    this.port = port;
  }

  async connect(): Promise<boolean> {
    console.log(`[Projector] RS-232 stub — would connect to ${this.port}`);
    return false;
  }

  async setPower(_on: boolean): Promise<void> {
    console.log(`[Projector] RS-232 stub — power ${_on ? 'on' : 'off'}`);
  }

  async setInput(_input: string): Promise<void> {
    console.log(`[Projector] RS-232 stub — input ${_input}`);
  }
}
