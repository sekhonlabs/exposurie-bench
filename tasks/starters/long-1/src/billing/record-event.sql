INSERT INTO webhook_events (id, type, occurred_at, payload, received_at)
VALUES (:id, :type, :occurred_at, :payload, :now)
ON CONFLICT (id) DO NOTHING;
