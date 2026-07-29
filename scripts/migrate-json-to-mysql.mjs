/**
 * One-time JSON → MySQL migration (no tsx required).
 * Usage on cPanel Terminal:
 *   export DATABASE_HOST=localhost
 *   export DATABASE_PORT=3306
 *   export DATABASE_NAME=vallian1_valliani_esign
 *   export DATABASE_USER=vallian1_valliani_esign
 *   export DATABASE_PASSWORD='your-password'
 *   node scripts/migrate-json-to-mysql.mjs
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const pool = mysql.createPool({
    host: required("DATABASE_HOST"),
    port: Number(process.env.DATABASE_PORT || "3306"),
    user: required("DATABASE_USER"),
    password: required("DATABASE_PASSWORD"),
    database: required("DATABASE_NAME"),
    waitForConnections: true,
    connectionLimit: 5,
  });

  const dataDir = path.join(process.cwd(), "data");
  const offices = readJson(path.join(dataDir, "offices.json"), []);
  const users = readJson(path.join(dataDir, "users.json"), []);
  const folders = readJson(path.join(dataDir, "template-folders.json"), []);
  const templates = readJson(path.join(dataDir, "templates.json"), []);
  const envelopes = readJson(path.join(dataDir, "envelopes.json"), []);
  const powerforms = readJson(path.join(dataDir, "powerforms.json"), []);
  const webforms = readJson(path.join(dataDir, "webforms.json"), []);
  const audits = readJson(path.join(dataDir, "audit-events.json"), []);
  const smtp = readJson(path.join(dataDir, "smtp-settings.json"), null);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    console.log("offices", offices.length);
    await conn.query("DELETE FROM offices");
    for (const office of offices) {
      await conn.query(
        `INSERT INTO offices (id, name, slug, email, phone, address, brand_color, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          office.id,
          office.name,
          office.slug,
          office.email || "",
          office.phone || "",
          office.address || "",
          office.brandColor || "#130032",
          office.isActive ? 1 : 0,
          toMysqlDateTime(office.createdAt),
          toMysqlDateTime(office.updatedAt),
        ]
      );
    }

    console.log("users", users.length);
    await conn.query("DELETE FROM users");
    for (const user of users) {
      await conn.query(
        `INSERT INTO users
          (id, office_id, name, email, role, password_salt, password_hash, is_active, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.officeId,
          user.name,
          user.email,
          user.role,
          user.passwordSalt,
          user.passwordHash,
          user.isActive ? 1 : 0,
          toMysqlDateTime(user.createdAt),
          toMysqlDateTime(user.updatedAt),
          toMysqlDateTime(user.lastLoginAt),
        ]
      );
    }

    console.log("folders", folders.length);
    await conn.query("DELETE FROM template_folder_links");
    await conn.query("DELETE FROM template_folders");
    for (const folder of folders) {
      await conn.query(
        `INSERT INTO template_folders (id, office_id, name, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          folder.id,
          folder.officeId,
          folder.name,
          folder.kind || "my",
          toMysqlDateTime(folder.createdAt),
          toMysqlDateTime(folder.updatedAt),
        ]
      );
    }

    console.log("templates", templates.length);
    await conn.query("DELETE FROM templates");
    for (const template of templates) {
      await conn.query(
        `INSERT INTO templates
          (id, office_id, name, title, status, visibility, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.id,
          template.officeId,
          template.name,
          template.title || template.name,
          template.status || "draft",
          template.visibility || "office",
          JSON.stringify(template),
          toMysqlDateTime(template.createdAt),
          toMysqlDateTime(template.updatedAt),
        ]
      );
      for (const folderId of template.folderIds || []) {
        await conn.query(`INSERT IGNORE INTO template_folder_links (template_id, folder_id) VALUES (?, ?)`, [
          template.id,
          folderId,
        ]);
      }
    }

    console.log("envelopes", envelopes.length);
    await conn.query("DELETE FROM recipients");
    await conn.query("DELETE FROM envelopes");
    for (const envelope of envelopes) {
      await conn.query(
        `INSERT INTO envelopes
          (id, office_id, envelope_number, title, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          envelope.id,
          envelope.officeId,
          envelope.envelopeNumber,
          envelope.title,
          envelope.status,
          JSON.stringify(envelope),
          toMysqlDateTime(envelope.createdAt),
          toMysqlDateTime(envelope.updatedAt),
        ]
      );
      for (const recipient of envelope.recipients || []) {
        await conn.query(
          `INSERT INTO recipients
            (id, envelope_id, email, name, status, signing_order, token_hash, payload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipient.id,
            envelope.id,
            recipient.email,
            recipient.name,
            recipient.status,
            recipient.order || 1,
            recipient.tokenHash || null,
            JSON.stringify(recipient),
            toMysqlDateTime(envelope.createdAt),
            toMysqlDateTime(envelope.updatedAt),
          ]
        );
      }
    }

    console.log("powerforms", powerforms.length);
    await conn.query("DELETE FROM powerforms");
    for (const form of powerforms) {
      await conn.query(
        `INSERT INTO powerforms
          (id, office_id, template_id, name, slug, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form.id,
          form.officeId,
          form.templateId,
          form.name,
          form.slug,
          form.status || "active",
          JSON.stringify(form),
          toMysqlDateTime(form.createdAt),
          toMysqlDateTime(form.updatedAt),
        ]
      );
    }

    console.log("webforms", webforms.length);
    await conn.query("DELETE FROM webforms");
    for (const form of webforms) {
      await conn.query(
        `INSERT INTO webforms
          (id, office_id, template_id, name, slug, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form.id,
          form.officeId,
          form.templateId,
          form.name,
          form.slug,
          form.status || "active",
          JSON.stringify(form),
          toMysqlDateTime(form.createdAt),
          toMysqlDateTime(form.updatedAt),
        ]
      );
    }

    console.log("audit", audits.length);
    await conn.query("DELETE FROM audit_events");
    for (const event of audits) {
      await conn.query(
        `INSERT INTO audit_events
          (id, office_id, envelope_id, recipient_id, event_type, message, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.officeId || null,
          event.envelopeId || null,
          event.recipientId || null,
          event.type,
          event.message,
          JSON.stringify(event),
          toMysqlDateTime(event.createdAt),
        ]
      );
    }

    if (smtp && smtp.host && smtp.user && smtp.pass && smtp.from) {
      console.log("smtp settings");
      await conn.query(
        `INSERT INTO smtp_settings (id, host, port, secure, user_name, pass_value, from_address, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           host = VALUES(host),
           port = VALUES(port),
           secure = VALUES(secure),
           user_name = VALUES(user_name),
           pass_value = VALUES(pass_value),
           from_address = VALUES(from_address),
           updated_at = VALUES(updated_at)`,
        [
          smtp.host,
          smtp.port || 465,
          smtp.secure === false ? 0 : 1,
          smtp.user,
          smtp.pass,
          smtp.from,
          toMysqlDateTime(smtp.updatedAt || new Date().toISOString()),
        ]
      );
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
    console.log("DONE — data copied into MySQL.");
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
