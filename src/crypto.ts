import crypto from 'crypto';

export enum RpfEncryption {
  NONE = 0x0,
  OPEN = 0x4E45504F,
  AES = 0x0FFFFFF9,
  NG = 0x0FEFFFFF
}

const PC_AES_KEY = Buffer.from([
  0x1A, 0x94, 0x6D, 0xBC, 0x73, 0xB8, 0x5E, 0x42,
  0x0B, 0x79, 0x45, 0x8C, 0x65, 0x00, 0x56, 0x7E
]);

export class GTACrypto {
  static decryptAES(data: Buffer): Buffer {
    const rounds = data.length + 15 >> 4;
    const decrypted = Buffer.alloc(data.length);

    for (let i = 0; i < rounds; i++) {
      const offset = i * 16;
      const blockSize = Math.min(16, data.length - offset);

      if (blockSize === 16) {
        const decipher = crypto.createDecipheriv('aes-128-ecb', PC_AES_KEY, null);
        decipher.setAutoPadding(false);

        const block = data.subarray(offset, offset + 16);
        const decryptedBlock = Buffer.concat([decipher.update(block), decipher.final()]);
        decryptedBlock.copy(decrypted, offset);
      } else {
        data.copy(decrypted, offset, offset, offset + blockSize);
      }
    }

    return decrypted;
  }

  static encryptAES(data: Buffer): Buffer {
    const rounds = data.length + 15 >> 4;
    const encrypted = Buffer.alloc(data.length);

    for (let i = 0; i < rounds; i++) {
      const offset = i * 16;
      const blockSize = Math.min(16, data.length - offset);

      if (blockSize === 16) {
        const cipher = crypto.createCipheriv('aes-128-ecb', PC_AES_KEY, null);
        cipher.setAutoPadding(false);

        const block = data.subarray(offset, offset + 16);
        const encryptedBlock = Buffer.concat([cipher.update(block), cipher.final()]);
        encryptedBlock.copy(encrypted, offset);
      } else {
        data.copy(encrypted, offset, offset, offset + blockSize);
      }
    }

    return encrypted;
  }

  static decryptNG(data: Buffer, name: string, size: number): Buffer {
    const key = this.generateNGKey(name, size);
    const decrypted = Buffer.alloc(data.length);

    for (let i = 0; i < data.length; i++) {
      decrypted[i] = data[i] ^ key[i % key.length];
    }

    return decrypted;
  }

  static encryptNG(data: Buffer, name: string, size: number): Buffer {
    return this.decryptNG(data, name, size);
  }

  private static generateNGKey(name: string, size: number): Buffer {
    const hash = crypto.createHash('sha256');
    hash.update(name.toLowerCase());
    hash.update(Buffer.from([size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF]));
    return hash.digest();
  }
}