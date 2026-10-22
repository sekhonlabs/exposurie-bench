SELECT u.id, u.email, u.plan, u.plan_ends_at, u.paddle_customer_id, u.digest, u.created_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.id = :id AND s.expires_at > :now;
