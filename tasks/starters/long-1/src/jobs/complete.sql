UPDATE jobs SET done_at = :now, claimed_at = NULL WHERE id = :id AND done_at IS NULL;
