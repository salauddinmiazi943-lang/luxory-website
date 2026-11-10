type StagingTarget = {
  uri: string;
  host: string;
  databaseName: string;
};

function requiredValue(env: Readonly<Record<string, string | undefined>>, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} must be set for a staging migration.`);
  return value;
}

function normalizedHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function getStagingMigrationTarget(env: Readonly<Record<string, string | undefined>>): StagingTarget {
  if (env.APP_ENV !== "staging") {
    throw new Error("Refusing migration: APP_ENV must be exactly 'staging'.");
  }

  if (requiredValue(env, "STAGING_MIGRATION_APPROVED") !== "STAGING_ONLY_APPROVED") {
    throw new Error("Refusing migration: explicitly set STAGING_MIGRATION_APPROVED=STAGING_ONLY_APPROVED.");
  }

  const uri = requiredValue(env, "STAGING_MONGODB_URI");
  const stagingHost = normalizedHost(requiredValue(env, "STAGING_MONGODB_HOST"));
  const stagingDatabase = requiredValue(env, "STAGING_DB_NAME");
  const productionHost = normalizedHost(requiredValue(env, "PRODUCTION_MONGODB_HOST"));
  const productionDatabase = requiredValue(env, "PRODUCTION_DB_NAME");

  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error("STAGING_MONGODB_URI must be a valid MongoDB URI.");
  }

  if (parsedUri.protocol !== "mongodb+srv:" && parsedUri.protocol !== "mongodb:") {
    throw new Error("STAGING_MONGODB_URI must use mongodb:// or mongodb+srv://.");
  }
  if (!parsedUri.username || !parsedUri.password) {
    throw new Error("STAGING_MONGODB_URI must use a dedicated staging database username and password.");
  }

  const uriHost = normalizedHost(parsedUri.hostname);
  const uriDatabase = decodeURIComponent(parsedUri.pathname.replace(/^\/+/, ""));
  if (!uriDatabase) {
    throw new Error("STAGING_MONGODB_URI must include the staging database name in its path.");
  }
  if (uriHost === productionHost) {
    throw new Error("Refusing migration: staging and production MongoDB hosts must be different.");
  }
  if (uriDatabase.toLowerCase() === productionDatabase.toLowerCase()) {
    throw new Error("Refusing migration: staging and production database names must be different.");
  }
  if (uriHost !== stagingHost) {
    throw new Error("Refusing migration: STAGING_MONGODB_URI host does not match STAGING_MONGODB_HOST.");
  }
  if (uriDatabase !== stagingDatabase) {
    throw new Error("Refusing migration: STAGING_MONGODB_URI database does not match STAGING_DB_NAME.");
  }

  return { uri, host: uriHost, databaseName: uriDatabase };
}
