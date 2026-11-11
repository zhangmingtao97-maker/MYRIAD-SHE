import type { QueryResult, QueryResultRow } from 'pg';

interface DiscussionSettingsQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface DiscussionSupportSettings {
  supportContact: string | null;
  appealContact: string | null;
}

function contactValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 200 ? normalized : null;
}

export async function readDiscussionSupportSettings(
  database: DiscussionSettingsQueryable,
): Promise<DiscussionSupportSettings> {
  const result = await database.query<{ key: string; value: unknown }>(
    `select key, value from system_settings
     where key = any($1::text[])`,
    [['support_contact', 'discussion_appeal_contact']],
  );
  const values = new Map(result.rows.map((row) => [row.key, row.value]));
  const supportContact = contactValue(values.get('support_contact'));
  const configuredAppealContact = contactValue(values.get('discussion_appeal_contact'));
  return {
    supportContact,
    appealContact: configuredAppealContact || supportContact,
  };
}