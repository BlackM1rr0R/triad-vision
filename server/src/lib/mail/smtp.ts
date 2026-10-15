import nodemailer from 'nodemailer';
import { mailSettings } from './settings.js';

/**
 * SMTP transport factory for staff mailboxes (one transport per send; the app-wide mailer in
 * lib/mailer.ts is a different thing: it sends the platform's own notifications). Tests inject a
 * fake transport with `setSmtpFactory`.
 */
export interface SmtpConnection {
  host: string;
  port: number;
  /** true = implicit TLS; false = STARTTLS when offered */
  secure: boolean;
  username: string;
  password: string;
}

export interface OutgoingMessage {
  envelope: { from: string; to: string[] };
  raw: Buffer;
}

export interface SmtpTransport {
  verify(): Promise<void>;
  send(msg: OutgoingMessage): Promise<{ messageId?: string }>;
  close(): void;
}

export type SmtpFactory = (conn: SmtpConnection) => SmtpTransport;

const realFactory: SmtpFactory = (conn) => {
  const transporter = nodemailer.createTransport({
    host: conn.host,
    port: conn.port,
    secure: conn.secure,
    requireTLS: !conn.secure,
    auth: { user: conn.username, pass: conn.password },
    connectionTimeout: mailSettings.timeoutMs,
    greetingTimeout: mailSettings.timeoutMs,
    socketTimeout: mailSettings.timeoutMs,
  });
  return {
    async verify() {
      await transporter.verify();
    },
    async send(msg) {
      const info = await transporter.sendMail({ envelope: msg.envelope, raw: msg.raw });
      return { messageId: info.messageId };
    },
    close() {
      transporter.close();
    },
  };
};

let factory: SmtpFactory = realFactory;

export const setSmtpFactory = (f: SmtpFactory | null) => {
  factory = f ?? realFactory;
};

export const createSmtpTransport = (conn: SmtpConnection) => factory(conn);

export const verifySmtp = async (conn: SmtpConnection) => {
  const t = createSmtpTransport(conn);
  try {
    await t.verify();
  } finally {
    t.close();
  }
};

/** In-memory transport for tests: records every message; `fail` makes sends reject. */
export class FakeSmtp {
  sent: OutgoingMessage[] = [];
  verified = 0;
  fail: string | null = null;
  failVerify: string | null = null;
  lastConn: SmtpConnection | null = null;

  createFactory(): SmtpFactory {
    return (conn) => {
      this.lastConn = conn;
      return {
        verify: async () => {
          this.verified++;
          if (this.failVerify) throw new Error(this.failVerify);
        },
        send: async (msg) => {
          if (this.fail) throw new Error(this.fail);
          this.sent.push(msg);
          return { messageId: undefined };
        },
        close: () => undefined,
      };
    };
  }
}
