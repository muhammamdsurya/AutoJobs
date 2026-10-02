import type { BankEntry } from './answers';
import { sql } from '@autojobs/shared/db';
import { PORTAL_LABEL, type Portal } from '@autojobs/shared/portals';

// What the Profile page keeps and applying uses. Name, phone, address and the like are left to the portals (they fill
// them from the user's own account there); older values in those columns are no longer read. Email = the account's.
export type Profile = {
  userId: string; email: string; linkedinUrl: string; portfolioUrl: string; currentTitle: string; yearsExperience: number | null;
  educationLevel: string; educationMajor: string; skills: string[]; expectedSalaryMin: number | null; noticePeriod: string;
  willingToRelocate: boolean;
};

export async function getProfile(userId: string): Promise<Profile | undefined> {
  const [p] = await sql<Profile[]>`select p.user_id, u.email, p.linkedin_url, p.portfolio_url, p.current_title, p.years_experience,
    p.education_level, p.education_major, p.skills, p.expected_salary_min, p.notice_period, p.willing_to_relocate
    from candidate_profiles p join users u on u.id = p.user_id where p.user_id = ${userId}`;
  return p;
}

export async function getExtras(userId: string, portal: Portal): Promise<Record<string, string>> {
  const rows = await sql<{ fieldKey: string; value: string }[]>`select field_key, value from portal_extra_fields where user_id = ${userId} and portal = ${portal}`;
  return Object.fromEntries(rows.map((r) => [r.fieldKey, r.value]));
}

export async function getBank(userId: string): Promise<(BankEntry & { id: string })[]> {
  return sql<(BankEntry & { id: string })[]>`select id, question_pattern, answer, portal from answer_bank where user_id = ${userId} order by created_at`;
}

export async function getDefaultCv(userId: string) {
  const [cv] = await sql<{ id: string; fileName: string }[]>`select id, file_name from cv_documents where user_id = ${userId} and is_default`;
  return cv;
}

// PR-07: what's missing before a campaign may apply on this portal. No CV here: without an AutoJobs CV the CV saved
// on the portal is used.
export function missingFor(portal: Portal, p: Profile | undefined, extras: Record<string, string>): string[] {
  const missing: string[] = [];
  if ((portal === 'jobstreet' || portal === 'glints') && !extras.expected_salary && !p?.expectedSalaryMin)
    missing.push(`gaji yang diharapkan (${PORTAL_LABEL[portal]})`);
  return missing;
}
