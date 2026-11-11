import type { QueryResult, QueryResultRow } from 'pg';

interface DiscussionRestrictionQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface ActiveDiscussionRestriction {
  id: string;
  reason: string;
  startsAt: Date;
  endsAt: Date | null;
}

export async function findActiveDiscussionRestriction(
  client: DiscussionRestrictionQueryable,
  userId: string,
) {
  const result = await client.query<ActiveDiscussionRestriction>(
    `select id, reason, starts_at as "startsAt", ends_at as "endsAt"
     from discussion_user_restrictions
     where user_id = $1 and revoked_at is null and starts_at <= now()
       and (ends_at is null or ends_at > now())
     order by starts_at desc, id desc
     limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}
