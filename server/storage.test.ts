import { describe, it, expect } from "vitest";
import { storagePut, storageGet } from "./storage";

// Storage usa modo local (sem CDN) em dev/test.
// URLs retornadas são /uploads/<key> e não há geração de nomes únicos
// (a mesma key sobrescreve o arquivo anterior).
describe("Storage (local mode)", () => {
  it("should upload a file and return a valid URL", async () => {
    const testData = Buffer.from("Test photo data");
    const testKey = "test/photo.jpg";

    const { key, url } = await storagePut(testKey, testData, "image/jpeg");

    expect(key).toBeTruthy();
    expect(url).toBeTruthy();
    // Local storage retorna /uploads/<key>; CDN retornaria https://files.manuscdn.com/...
    expect(url).toMatch(/\.(jpg|jpeg|png|webp)$/);

    console.log("✅ Upload successful:", { key, url });
  });

  it.skip("CDN: should generate unique filenames for uploads (requires CDN config)", async () => {
    // Teste relevante apenas quando MANUS_CDN_URL está configurado.
    // Local storage sobrescreve o mesmo arquivo com a mesma key.
    const testData = Buffer.from("Test data 1");
    const result1 = await storagePut("test/file.jpg", testData, "image/jpeg");

    const testData2 = Buffer.from("Test data 2");
    const result2 = await storagePut("test/file.jpg", testData2, "image/jpeg");

    expect(result1.key).not.toBe(result2.key);
    expect(result1.url).not.toBe(result2.url);
  });
});
