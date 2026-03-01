/**
 * Storage — Armazenamento Local de Arquivos
 *
 * Versão independente do Manus.
 * Redireciona para o sistema de armazenamento local (disco do servidor).
 *
 * Compatível com o código existente que importa de './storage'.
 */

export {
  storageLocalPut as storagePut,
  storageLocalGet as storageGet,
  storageLocalDelete as storageDelete,
  storageLocalList as storageList,
} from './storageLocal';
