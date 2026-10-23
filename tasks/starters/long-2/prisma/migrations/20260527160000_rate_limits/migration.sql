-- TW-1182: the limiter's counters, one row per API key and minute.

-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("key","window_start")
);
