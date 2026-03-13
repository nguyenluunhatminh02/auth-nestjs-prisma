import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial Schema Migration
 * 
 * Creates the initial database schema for the e-commerce application.
 * This includes tables for users, roles, authentication, notifications, and file storage.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create roles table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) UNIQUE NOT NULL
      )
    `);

    // Insert default roles
    await queryRunner.query(`
      INSERT INTO "roles" ("name") VALUES 
      ('ADMIN'), ('USER'), ('MODERATOR')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "email" varchar(255) UNIQUE NOT NULL,
        "password" varchar(255),
        "first_name" varchar(255) NOT NULL,
        "last_name" varchar(255) NOT NULL,
        "phone" varchar(50),
        "avatar_url" varchar(500),
        "date_of_birth" date,
        "gender" varchar(20),
        "provider" varchar(50) DEFAULT 'LOCAL',
        "provider_id" varchar(255),
        "email_verified" boolean DEFAULT false,
        "email_verification_token" varchar(255),
        "email_verification_expiry" timestamp,
        "password_reset_token" varchar(255),
        "password_reset_expiry" timestamp,
        "two_factor_enabled" boolean DEFAULT false,
        "two_factor_secret" varchar(255),
        "is_active" boolean DEFAULT true,
        "is_locked" boolean DEFAULT false,
        "failed_login_attempts" integer DEFAULT 0,
        "lock_time" timestamp,
        "last_login_at" timestamp,
        "last_login_ip" varchar(50),
        "is_deleted" boolean DEFAULT false,
        "deleted_at" timestamp,
        "language" varchar(10) DEFAULT 'en',
        "timezone" varchar(50) DEFAULT 'UTC',
        "notification_email_enabled" boolean DEFAULT true,
        "notification_push_enabled" boolean DEFAULT true,
        "notification_in_app_enabled" boolean DEFAULT true,
        "notification_security_enabled" boolean DEFAULT true,
        "notification_order_enabled" boolean DEFAULT true,
        "notification_promotion_enabled" boolean DEFAULT false,
        "profile_public" boolean DEFAULT false,
        "show_email" boolean DEFAULT false,
        "show_phone" boolean DEFAULT false,
        "show_activity_status" boolean DEFAULT true,
        "delete_status" varchar(50) DEFAULT 'ACTIVE',
        "delete_requested_at" timestamp,
        "fcm_token" varchar(500)
      )
    `);

    // Create user_roles junction table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "users_id" uuid NOT NULL,
        "roles_id" uuid NOT NULL,
        PRIMARY KEY ("users_id", "roles_id"),
        CONSTRAINT "fk_user_roles_users" FOREIGN KEY ("users_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_roles_roles" FOREIGN KEY ("roles_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);

    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token" varchar(255) UNIQUE NOT NULL,
        "is_revoked" boolean DEFAULT false,
        "expires_at" timestamp NOT NULL,
        "user_agent" varchar(512),
        "ip_address" varchar(50),
        "device_info" varchar(255),
        "last_active_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "user_id" uuid,
        CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create login_history table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "login_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "action" varchar(50) NOT NULL,
        "ip_address" varchar(50),
        "user_agent" varchar(512),
        "device_info" varchar(255),
        "success" boolean,
        "failure_reason" varchar(255),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_login_history_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create device_fingerprints table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_fingerprints" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "fingerprint" varchar(255) NOT NULL,
        "device_name" varchar(255),
        "browser" varchar(100),
        "os" varchar(100),
        "ip_address" varchar(50),
        "is_trusted" boolean DEFAULT false,
        "last_seen_at" timestamp,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_device_fingerprints_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create security_questions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "question" varchar(500) NOT NULL,
        "answer_hash" varchar(255) NOT NULL,
        "sort_order" integer DEFAULT 0,
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_security_questions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create notifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
        "user_id" uuid,
        "title" varchar(255) NOT NULL,
        "message" text NOT NULL,
        "type" varchar(50) NOT NULL,
        "channel" varchar(50) NOT NULL,
        "data" text,
        "is_read" boolean DEFAULT false,
        "read_at" timestamp,
        CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_device_fingerprints_user_id" ON "device_fingerprints"("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_device_fingerprints_fingerprint" ON "device_fingerprints"("fingerprint")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token" ON "refresh_tokens"("token")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_login_history_user_id" ON "login_history"("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications"("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order of creation (due to foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "security_questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_fingerprints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "login_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
