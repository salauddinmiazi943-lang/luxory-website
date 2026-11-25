import assert from "node:assert/strict";
import test from "node:test";
import { getStagingMigrationTarget } from "./staging-target";

const validEnvironment = {
  APP_ENV: "staging",
  STAGING_MIGRATION_APPROVED: "STAGING_ONLY_APPROVED",
  STAGING_MONGODB_URI: "mongodb+srv://staging-user:staging-pass@staging.example.net/luxora_staging",
  STAGING_MONGODB_HOST: "staging.example.net",
  STAGING_DB_NAME: "luxora_staging",
  PRODUCTION_MONGODB_HOST: "production.example.net",
  PRODUCTION_DB_NAME: "luxora_production",
};

test("accepts a staging URI that matches the explicitly configured staging target", () => {
  assert.deepEqual(getStagingMigrationTarget(validEnvironment), {
    uri: validEnvironment.STAGING_MONGODB_URI,
    host: "staging.example.net",
    databaseName: "luxora_staging",
  });
});

test("rejects production or unspecified application environments", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    APP_ENV: "production",
  }), /APP_ENV must be exactly 'staging'/);
});

test("rejects a URI targeting the production host", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MONGODB_URI: "mongodb+srv://user:pass@other.example.net/luxora_staging",
  }), /host does not match STAGING_MONGODB_HOST/);
});

test("rejects staging configured on the production host", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MONGODB_URI: "mongodb+srv://user:pass@production.example.net/luxora_staging",
    STAGING_MONGODB_HOST: "production.example.net",
  }), /staging and production MongoDB hosts must be different/);
});

test("rejects a URI whose database does not match the staging database name", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MONGODB_URI: "mongodb+srv://user:pass@staging.example.net/other_database",
  }), /database does not match STAGING_DB_NAME/);
});

test("rejects a staging database name that overlaps production", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MONGODB_URI: "mongodb+srv://user:pass@staging.example.net/luxora_production",
    STAGING_DB_NAME: "luxora_production",
  }), /database names must be different/);
});

test("requires explicit staging approval and credentials", () => {
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MIGRATION_APPROVED: "",
  }), /STAGING_MIGRATION_APPROVED must be set/);
  assert.throws(() => getStagingMigrationTarget({
    ...validEnvironment,
    STAGING_MONGODB_URI: "mongodb+srv://staging.example.net/luxora_staging",
  }), /dedicated staging database username and password/);
});
