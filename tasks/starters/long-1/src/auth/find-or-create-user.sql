INSERT INTO users (id, email, created_at)
VALUES (:id, :email, :now)
ON CONFLICT (email) DO UPDATE SET email = users.email
RETURNING id, email;
