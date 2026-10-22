UPDATE users
SET plan = :plan,
  plan_ends_at = :plan_ends_at,
  paddle_customer_id = :customer_id,
  paddle_subscription_id = :subscription_id,
  plan_updated_at = :updated_at
WHERE id = :id;
