import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import "server-only";

import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	// Format: base64(iv + encrypted + authTag)
	return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

export function decrypt(ciphertext: string): string {
	const data = Buffer.from(ciphertext, "base64");

	const iv = data.subarray(0, IV_LENGTH);
	const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
	const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});
	decipher.setAuthTag(authTag);

	return decipher.update(encrypted) + decipher.final("utf8");
}
