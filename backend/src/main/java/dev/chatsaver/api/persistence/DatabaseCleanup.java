package dev.chatsaver.api.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DatabaseCleanup {

    private final JdbcTemplate jdbc;

    DatabaseCleanup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 21_600_000)
    @Transactional
    public void removeObsoleteRows() {
        jdbc.update("DELETE FROM refresh_session WHERE expires_at < now()");
        jdbc.update("DELETE FROM pending_registration WHERE expires_at < now()");
        jdbc.update("DELETE FROM pending_password_reset WHERE expires_at < now()");
        jdbc.update("""
                DELETE FROM deletion_marker marker
                WHERE marker.change_cursor IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM device
                      WHERE device.user_id = marker.user_id
                        AND device.revoked_at IS NULL
                        AND coalesce(device.last_sync_cursor, 0) < marker.change_cursor
                  )
                """);
    }
}
