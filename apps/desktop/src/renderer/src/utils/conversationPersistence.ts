import type { ConversationPersistenceApi } from "@deepwrite/contracts";
import { mergeAgentConversationPersistenceSnapshots } from "../composables/useAgentConversation";
import {
  MODEL_SELECTION_PERSISTENCE_KEY,
  RUN_PREFERENCES_PERSISTENCE_KEY,
  type ConversationPersistenceAdapter
} from "../stores/conversationStore";
import {
  AGENT_MODEL_SELECTION_STORAGE_KEY,
  AGENT_RUN_PREFERENCES_STORAGE_KEY,
  parseAgentModelSelection,
  parseAgentRunPreferences
} from "./agentRunPreferences";

const HISTORY_PREFIX = "conversation-history:";
export const LEGACY_CONVERSATION_HISTORY_STORAGE_PREFIX =
  "deepwrite:agent-conversations:v1:";
const MAX_PERSISTENCE_KEY_LENGTH = 240;
const HASH_OFFSET = 0xcbf29ce484222325n;
const HASH_PRIME = 0x100000001b3n;
const HASH_MASK = 0xffffffffffffffffn;
const HASHED_KEY_SUFFIX = /~[a-f0-9]{16}$/u;

export type ConversationLegacyStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "key" | "length"
>;

export interface ConversationPersistenceAdapterOptions {
  storage?: ConversationLegacyStorage;
}

function stableKeyHash(value: string): string {
  let hash = HASH_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * HASH_PRIME) & HASH_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Converts an in-memory conversation identity into a contract-safe key.
 * Long filesystem-derived identities retain a readable prefix plus a stable
 * suffix, while ordinary keys remain fully reversible in diagnostics.
 */
export function conversationHistoryPersistenceKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) throw new Error("会话 key 不能为空。");
  const encoded = encodeURIComponent(normalized);
  const direct = `${HISTORY_PREFIX}${encoded}`;
  if (direct.length <= MAX_PERSISTENCE_KEY_LENGTH) return direct;

  const hash = stableKeyHash(normalized);
  const suffix = `~${hash}`;
  const prefixLength =
    MAX_PERSISTENCE_KEY_LENGTH - HISTORY_PREFIX.length - suffix.length;
  return `${HISTORY_PREFIX}${encoded.slice(0, prefixLength)}${suffix}`;
}

export function legacyConversationHistoryStorageKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) throw new Error("会话 key 不能为空。");
  return `${LEGACY_CONVERSATION_HISTORY_STORAGE_PREFIX}${encodeURIComponent(
    normalized
  )}`;
}

function decodePersistenceSuffix(encoded: string): string | undefined {
  const hashed = HASHED_KEY_SUFFIX.exec(encoded)?.[0];
  const reversible = hashed ? encoded.slice(0, -hashed.length) : encoded;
  if (!reversible) return undefined;
  try {
    return decodeURIComponent(reversible);
  } catch {
    return reversible;
  }
}

function persistenceKeyFromLegacyStorageKey(
  storageKey: string
): string | undefined {
  if (storageKey.startsWith(LEGACY_CONVERSATION_HISTORY_STORAGE_PREFIX)) {
    const encoded = storageKey.slice(
      LEGACY_CONVERSATION_HISTORY_STORAGE_PREFIX.length
    );
    const logicalKey = decodePersistenceSuffix(encoded);
    if (!logicalKey?.trim()) return undefined;
    try {
      return conversationHistoryPersistenceKey(logicalKey);
    } catch {
      return undefined;
    }
  }
  if (
    storageKey.startsWith(HISTORY_PREFIX) &&
    storageKey.length <= MAX_PERSISTENCE_KEY_LENGTH
  ) {
    const encoded = storageKey.slice(HISTORY_PREFIX.length);
    if (HASHED_KEY_SUFFIX.test(encoded)) return storageKey;
    const logicalKey = decodePersistenceSuffix(encoded);
    if (!logicalKey?.trim()) return undefined;
    try {
      return conversationHistoryPersistenceKey(logicalKey);
    } catch {
      return storageKey;
    }
  }
  return undefined;
}

function listStorageKeys(storage: ConversationLegacyStorage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

function readStorageItem(
  storage: ConversationLegacyStorage,
  key: string
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorageItem(
  storage: ConversationLegacyStorage,
  key: string
): void {
  try {
    storage.removeItem(key);
  } catch {
    // Quota / privacy-mode failures must not block the live adapter.
  }
}

function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

async function migrateLegacyConversationEntry(
  api: ConversationPersistenceApi,
  persistenceKey: string,
  raw: string
): Promise<boolean> {
  const legacyValue = parseJsonValue(raw);
  const current = await api.load(persistenceKey);
  const merged = mergeAgentConversationPersistenceSnapshots(current, [
    legacyValue
  ]);
  if (!merged) return false;
  if (!sameJsonValue(current, merged)) {
    await api.save(persistenceKey, merged);
  }
  return true;
}

async function migrateLegacyModelSelection(
  api: ConversationPersistenceApi,
  raw: string
): Promise<boolean> {
  const legacy = parseAgentModelSelection(raw);
  if (!legacy) return false;
  const current = parseAgentModelSelection(
    jsonStringOrNull(await api.load(MODEL_SELECTION_PERSISTENCE_KEY))
  );
  if (!current) {
    await api.save(MODEL_SELECTION_PERSISTENCE_KEY, legacy);
  }
  return true;
}

async function migrateLegacyRunPreferences(
  api: ConversationPersistenceApi,
  raw: string
): Promise<boolean> {
  const legacy = parseAgentRunPreferences(raw);
  if (!Object.keys(legacy).length) return false;
  const current = parseAgentRunPreferences(
    jsonStringOrNull(await api.load(RUN_PREFERENCES_PERSISTENCE_KEY))
  );
  const merged = { ...legacy, ...current };
  if (!sameJsonValue(current, merged)) {
    await api.save(RUN_PREFERENCES_PERSISTENCE_KEY, merged);
  }
  return true;
}

function jsonStringOrNull(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function conversationEnvelopeHasContent(value: unknown): boolean {
  if (!isPlainRecord(value) || !Array.isArray(value.conversations)) {
    return false;
  }
  return value.conversations.some((conversation) => {
    if (!isPlainRecord(conversation)) return false;
    if (typeof conversation.draft === "string" && conversation.draft.trim()) {
      return true;
    }
    return (
      Array.isArray(conversation.messages) && conversation.messages.length > 0
    );
  });
}

function isEmptyConversationEnvelope(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.conversations) &&
    !conversationEnvelopeHasContent(value)
  );
}

function mapEnvelopeMessages(
  value: unknown,
  mapMessage: (message: Record<string, unknown>) => Record<string, unknown>
): unknown {
  if (!isPlainRecord(value) || !Array.isArray(value.conversations)) {
    return value;
  }
  let changed = false;
  const conversations = value.conversations.map((conversation) => {
    if (!isPlainRecord(conversation) || !Array.isArray(conversation.messages)) {
      return conversation;
    }
    const messages = conversation.messages.map((message) => {
      if (!isPlainRecord(message)) return message;
      const next = mapMessage(message);
      if (next !== message) changed = true;
      return next;
    });
    return changed ? { ...conversation, messages } : conversation;
  });
  return changed ? { ...value, conversations } : value;
}

function compactEvaluationToolSchemas(value: unknown): unknown {
  return mapEnvelopeMessages(value, (message) => {
    const snapshot = message.evaluationSnapshot;
    if (
      !isPlainRecord(snapshot) ||
      !Array.isArray(snapshot.tools) ||
      snapshot.tools.length === 0
    ) {
      return message;
    }
    return {
      ...message,
      evaluationSnapshot: {
        ...snapshot,
        tools: snapshot.tools.map((tool) => {
          if (!isPlainRecord(tool)) return tool;
          const { inputSchema: _inputSchema, ...rest } = tool;
          return rest;
        })
      }
    };
  });
}

function stripEvaluationSnapshots(value: unknown): unknown {
  return mapEnvelopeMessages(value, (message) => {
    if (!Object.prototype.hasOwnProperty.call(message, "evaluationSnapshot")) {
      return message;
    }
    const { evaluationSnapshot: _removed, ...rest } = message;
    return rest;
  });
}

async function saveConversationEnvelope(
  api: ConversationPersistenceApi,
  key: string,
  value: unknown
): Promise<void> {
  try {
    await api.save(key, value);
    return;
  } catch (firstError) {
    const compacted = compactEvaluationToolSchemas(value);
    if (!sameJsonValue(compacted, value)) {
      try {
        await api.save(key, compacted);
        return;
      } catch {
        // Fall through and persist the conversation without evaluation snapshots.
      }
    }
    const stripped = stripEvaluationSnapshots(value);
    if (sameJsonValue(stripped, value)) throw firstError;
    await api.save(key, stripped);
  }
}

async function migrateLegacyConversationPersistence(
  api: ConversationPersistenceApi,
  storage: ConversationLegacyStorage
): Promise<void> {
  for (const storageKey of listStorageKeys(storage)) {
    const raw = readStorageItem(storage, storageKey);
    if (!raw) continue;
    try {
      let migrated = false;
      if (storageKey === AGENT_MODEL_SELECTION_STORAGE_KEY) {
        migrated = await migrateLegacyModelSelection(api, raw);
      } else if (storageKey === AGENT_RUN_PREFERENCES_STORAGE_KEY) {
        migrated = await migrateLegacyRunPreferences(api, raw);
      } else {
        const persistenceKey = persistenceKeyFromLegacyStorageKey(storageKey);
        if (!persistenceKey) continue;
        migrated = await migrateLegacyConversationEntry(
          api,
          persistenceKey,
          raw
        );
      }
      if (migrated) removeStorageItem(storage, storageKey);
    } catch {
      // Keep the localStorage copy when a single key cannot be written.
    }
  }
}

export function createConversationPersistenceAdapter(
  api: ConversationPersistenceApi | undefined,
  options: ConversationPersistenceAdapterOptions = {}
): ConversationPersistenceAdapter | null {
  if (!api) return null;
  const persistenceApi = api;
  const storage = options.storage;
  let migratePromise: Promise<void> | undefined;

  function migrateLegacy(): Promise<void> {
    if (!storage) return Promise.resolve();
    if (!migratePromise) {
      migratePromise = migrateLegacyConversationPersistence(
        persistenceApi,
        storage
      ).catch(() => undefined);
    }
    return migratePromise;
  }

  return {
    async load(key) {
      await migrateLegacy();
      return persistenceApi.load(key);
    },
    async save(key, value) {
      await migrateLegacy();
      if (
        key.startsWith(HISTORY_PREFIX) &&
        isEmptyConversationEnvelope(value)
      ) {
        const current = await persistenceApi.load(key);
        if (conversationEnvelopeHasContent(current)) {
          return;
        }
      }
      if (key.startsWith(HISTORY_PREFIX)) {
        return saveConversationEnvelope(persistenceApi, key, value);
      }
      return persistenceApi.save(key, value);
    },
    async remove(key) {
      await migrateLegacy();
      return persistenceApi.remove(key);
    }
  };
}
