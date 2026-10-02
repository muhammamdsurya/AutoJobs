-- One answer per question pattern (ignoring case) and portal scope: the same question answered again replaces its
-- answer instead of adding a row. Existing duplicates keep their newest row.
delete from answer_bank a using answer_bank b
  where a.user_id = b.user_id and lower(a.question_pattern) = lower(b.question_pattern)
    and coalesce(a.portal, '') = coalesce(b.portal, '') and (a.created_at, a.id) < (b.created_at, b.id);
create unique index answer_bank_one_per_question on answer_bank (user_id, lower(question_pattern), coalesce(portal, ''));
