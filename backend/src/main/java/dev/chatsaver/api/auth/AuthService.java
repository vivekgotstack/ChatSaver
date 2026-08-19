package dev.chatsaver.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dev.chatsaver.api.auth.JwtService.AccessToken;

@Service
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int REFRESH_TOKEN_BYTES = 32;
    private static final int BCRYPT_MAX_BYTES = 72;
    private static final int VERIFICATION_CODE_BOUND = 1_000_000;
    private static final int MAX_VERIFICATION_ATTEMPTS = 5;
    private static final Duration VERIFICATION_TTL = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SmtpEmailService emailService;
    private final Duration refreshTokenTtl;

    public AuthService(
            JdbcTemplate jdbc,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            SmtpEmailService emailService,
            @Value("${chatsaver.auth.refresh-token-days}") long refreshTokenDays) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.refreshTokenTtl = Duration.ofDays(refreshTokenDays);
    }

    public RegistrationChallenge requestRegistration(
            String email,
            String password,
            String displayName,
            UUID deviceId,
            String deviceName) {
        String normalizedEmail = normalizeEmail(email);
        validatePasswordBytes(password);
        if (findUserByEmail(normalizedEmail).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account already uses this email.");
        }

        Instant now = Instant.now();
        List<Timestamp> recentSends = jdbc.query(
                "SELECT last_sent_at FROM pending_registration WHERE email = ?",
                (resultSet, rowNumber) -> resultSet.getTimestamp("last_sent_at"),
                normalizedEmail);
        if (!recentSends.isEmpty()
                && recentSends.getFirst().toInstant().plus(RESEND_COOLDOWN).isAfter(now)) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Please wait one minute before requesting another code.");
        }

        String code = "%06d".formatted(SECURE_RANDOM.nextInt(VERIFICATION_CODE_BOUND));
        Instant expiresAt = now.plus(VERIFICATION_TTL);
        jdbc.update("""
                INSERT INTO pending_registration
                    (email, password_hash, display_name, verification_code_hash,
                     device_id, device_name, attempts, expires_at, last_sent_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                ON CONFLICT (email) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    display_name = excluded.display_name,
                    verification_code_hash = excluded.verification_code_hash,
                    device_id = excluded.device_id,
                    device_name = excluded.device_name,
                    attempts = 0,
                    expires_at = excluded.expires_at,
                    last_sent_at = excluded.last_sent_at
                """,
                normalizedEmail,
                passwordEncoder.encode(password),
                cleanDisplayName(displayName),
                hashToken(normalizedEmail + ":" + code),
                deviceId,
                cleanDeviceName(deviceName),
                Timestamp.from(expiresAt),
                Timestamp.from(now),
                Timestamp.from(now));

        try {
            emailService.sendVerificationCode(normalizedEmail, displayName, code);
        } catch (RuntimeException exception) {
            jdbc.update("DELETE FROM pending_registration WHERE email = ?", normalizedEmail);
            throw exception;
        }
        return new RegistrationChallenge(normalizedEmail, expiresAt);
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public Session verifyRegistration(String email, String code) {
        String normalizedEmail = normalizeEmail(email);
        List<PendingRegistrationRow> matches = jdbc.query("""
                SELECT email, password_hash, display_name, verification_code_hash,
                       device_id, device_name, attempts, expires_at
                FROM pending_registration
                WHERE email = ?
                FOR UPDATE
                """, AuthService::mapPendingRegistration, normalizedEmail);
        PendingRegistrationRow pending = matches.stream().findFirst().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request a new verification code."));

        if (!pending.expiresAt().isAfter(Instant.now())) {
            jdbc.update("DELETE FROM pending_registration WHERE email = ?", normalizedEmail);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The verification code has expired.");
        }
        if (pending.attempts() >= MAX_VERIFICATION_ATTEMPTS) {
            jdbc.update("DELETE FROM pending_registration WHERE email = ?", normalizedEmail);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Request a new verification code.");
        }

        String submittedHash = hashToken(normalizedEmail + ":" + code.trim());
        if (!MessageDigest.isEqual(
                submittedHash.getBytes(StandardCharsets.US_ASCII),
                pending.verificationCodeHash().getBytes(StandardCharsets.US_ASCII))) {
            jdbc.update(
                    "UPDATE pending_registration SET attempts = attempts + 1 WHERE email = ?",
                    normalizedEmail);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That verification code is incorrect.");
        }

        if (findUserByEmail(normalizedEmail).isPresent()) {
            jdbc.update("DELETE FROM pending_registration WHERE email = ?", normalizedEmail);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account already uses this email.");
        }

        UUID userId = UUID.randomUUID();
        try {
            jdbc.update("""
                    INSERT INTO app_user (id, email, display_name, password_hash)
                    VALUES (?, ?, ?, ?)
                    """, userId, normalizedEmail, pending.displayName(), pending.passwordHash());
            jdbc.update("""
                    INSERT INTO device (id, user_id, name, last_seen_at)
                    VALUES (?, ?, ?, now())
                    """, pending.deviceId(), userId, pending.deviceName());
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "The account or device already exists.",
                    exception);
        }

        jdbc.update("DELETE FROM pending_registration WHERE email = ?", normalizedEmail);
        UserRow user = findUserById(userId).orElseThrow();
        return issueSession(user, pending.deviceId(), UUID.randomUUID());
    }

    @Transactional
    public Session login(String email, String password, UUID deviceId, String deviceName) {
        String normalizedEmail = normalizeEmail(email);
        validatePasswordBytes(password);
        UserRow user = findUserByEmail(normalizedEmail)
                .filter(candidate -> candidate.passwordHash() != null)
                .filter(candidate -> passwordEncoder.matches(password, candidate.passwordHash()))
                .orElseThrow(AuthService::unauthorized);

        registerOrTouchDevice(user.id(), deviceId, deviceName);
        jdbc.update("""
                UPDATE refresh_session
                SET revoked_at = now()
                WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL
                """, user.id(), deviceId);
        return issueSession(user, deviceId, UUID.randomUUID());
    }

    @Transactional
    public Session refresh(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw unauthorized();
        }

        String tokenHash = hashToken(rawRefreshToken);
        RefreshRow current = lockRefreshSession(tokenHash).orElseThrow(AuthService::unauthorized);
        if (current.rotatedAt() != null || current.revokedAt() != null) {
            jdbc.update("""
                    UPDATE refresh_session
                    SET revoked_at = coalesce(revoked_at, now())
                    WHERE family_id = ?
                    """, current.familyId());
            throw unauthorized();
        }
        if (!current.expiresAt().isAfter(Instant.now())) {
            jdbc.update("UPDATE refresh_session SET revoked_at = now() WHERE id = ?", current.id());
            throw unauthorized();
        }

        UserRow user = findUserById(current.userId()).orElseThrow(AuthService::unauthorized);
        ensureActiveDevice(current.deviceId(), current.userId());

        RefreshToken replacement = createRefreshToken(
                current.userId(),
                current.deviceId(),
                current.familyId());
        jdbc.update("""
                UPDATE refresh_session
                SET rotated_at = now(), replaced_by = ?
                WHERE id = ?
                """, replacement.id(), current.id());
        touchDevice(current.deviceId());

        AccessToken accessToken = jwtService.issue(user.id(), current.deviceId(), user.email());
        return new Session(user.toPublicUser(), accessToken, replacement.rawValue(), replacement.expiresAt());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            return;
        }
        jdbc.update("""
                UPDATE refresh_session
                SET revoked_at = coalesce(revoked_at, now())
                WHERE token_hash = ?
                """, hashToken(rawRefreshToken));
    }

    public List<DeviceSummary> listDevices(AuthenticatedUser user) {
        return jdbc.query("""
                SELECT id, name, last_seen_at, last_sync_cursor
                FROM device
                WHERE user_id = ? AND revoked_at IS NULL
                ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
                """, (resultSet, rowNumber) -> {
            UUID id = resultSet.getObject("id", UUID.class);
            return new DeviceSummary(
                    id,
                    resultSet.getString("name"),
                    nullableInstant(resultSet, "last_seen_at"),
                    resultSet.getLong("last_sync_cursor"),
                    id.equals(user.deviceId()));
        }, user.userId());
    }

    @Transactional
    public void revokeDevice(AuthenticatedUser user, UUID deviceId) {
        if (deviceId.equals(user.deviceId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Sign out from this device instead of removing it remotely.");
        }
        int updated = jdbc.update("""
                UPDATE device
                SET revoked_at = now()
                WHERE id = ? AND user_id = ? AND revoked_at IS NULL
                """, deviceId, user.userId());
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That device is no longer active.");
        }
        jdbc.update("""
                UPDATE refresh_session
                SET revoked_at = coalesce(revoked_at, now())
                WHERE device_id = ? AND user_id = ? AND revoked_at IS NULL
                """, deviceId, user.userId());
    }

    private Session issueSession(UserRow user, UUID deviceId, UUID familyId) {
        RefreshToken refreshToken = createRefreshToken(user.id(), deviceId, familyId);
        AccessToken accessToken = jwtService.issue(user.id(), deviceId, user.email());
        return new Session(user.toPublicUser(), accessToken, refreshToken.rawValue(), refreshToken.expiresAt());
    }

    private RefreshToken createRefreshToken(UUID userId, UUID deviceId, UUID familyId) {
        byte[] tokenBytes = new byte[REFRESH_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(tokenBytes);
        String rawValue = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        Instant expiresAt = Instant.now().plus(refreshTokenTtl);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO refresh_session
                    (id, user_id, device_id, token_hash, family_id, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, userId, deviceId, hashToken(rawValue), familyId, Timestamp.from(expiresAt));
        return new RefreshToken(id, rawValue, expiresAt);
    }

    private Optional<RefreshRow> lockRefreshSession(String tokenHash) {
        List<RefreshRow> matches = jdbc.query("""
                SELECT id, user_id, device_id, family_id, expires_at, rotated_at, revoked_at
                FROM refresh_session
                WHERE token_hash = ?
                FOR UPDATE
                """, AuthService::mapRefreshRow, tokenHash);
        return matches.stream().findFirst();
    }

    private void registerOrTouchDevice(UUID userId, UUID deviceId, String deviceName) {
        List<DeviceRow> devices = jdbc.query("""
                SELECT user_id, revoked_at
                FROM device
                WHERE id = ?
                """, (resultSet, rowNumber) -> new DeviceRow(
                        resultSet.getObject("user_id", UUID.class),
                        nullableInstant(resultSet, "revoked_at")), deviceId);
        if (devices.isEmpty()) {
            jdbc.update("""
                    INSERT INTO device (id, user_id, name, last_seen_at)
                    VALUES (?, ?, ?, now())
                    """, deviceId, userId, cleanDeviceName(deviceName));
            return;
        }
        DeviceRow device = devices.getFirst();
        if (!userId.equals(device.userId()) || device.revokedAt() != null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This device identifier cannot be used for this session.");
        }
        jdbc.update("""
                UPDATE device
                SET name = ?, last_seen_at = now()
                WHERE id = ?
                """, cleanDeviceName(deviceName), deviceId);
    }

    private void ensureActiveDevice(UUID deviceId, UUID userId) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*)
                FROM device
                WHERE id = ? AND user_id = ? AND revoked_at IS NULL
                """, Integer.class, deviceId, userId);
        if (count == null || count != 1) {
            throw unauthorized();
        }
    }

    private void touchDevice(UUID deviceId) {
        jdbc.update("UPDATE device SET last_seen_at = now() WHERE id = ?", deviceId);
    }

    private Optional<UserRow> findUserByEmail(String email) {
        List<UserRow> matches = jdbc.query("""
                SELECT id, email, display_name, password_hash
                FROM app_user
                WHERE email = ? AND deleted_at IS NULL
                """, AuthService::mapUserRow, email);
        return matches.stream().findFirst();
    }

    private Optional<UserRow> findUserById(UUID id) {
        List<UserRow> matches = jdbc.query("""
                SELECT id, email, display_name, password_hash
                FROM app_user
                WHERE id = ? AND deleted_at IS NULL
                """, AuthService::mapUserRow, id);
        return matches.stream().findFirst();
    }

    private static UserRow mapUserRow(ResultSet resultSet, int rowNumber) throws SQLException {
        return new UserRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("email"),
                resultSet.getString("display_name"),
                resultSet.getString("password_hash"));
    }

    private static RefreshRow mapRefreshRow(ResultSet resultSet, int rowNumber) throws SQLException {
        return new RefreshRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("user_id", UUID.class),
                resultSet.getObject("device_id", UUID.class),
                resultSet.getObject("family_id", UUID.class),
                nullableInstant(resultSet, "expires_at"),
                nullableInstant(resultSet, "rotated_at"),
                nullableInstant(resultSet, "revoked_at"));
    }

    private static PendingRegistrationRow mapPendingRegistration(ResultSet resultSet, int rowNumber)
            throws SQLException {
        return new PendingRegistrationRow(
                resultSet.getString("email"),
                resultSet.getString("password_hash"),
                resultSet.getString("display_name"),
                resultSet.getString("verification_code_hash"),
                resultSet.getObject("device_id", UUID.class),
                resultSet.getString("device_name"),
                resultSet.getInt("attempts"),
                nullableInstant(resultSet, "expires_at"));
    }

    private static Instant nullableInstant(ResultSet resultSet, String column) throws SQLException {
        Timestamp timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String cleanDisplayName(String displayName) {
        String cleaned = displayName == null ? "" : displayName.trim();
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String cleanDeviceName(String deviceName) {
        String cleaned = deviceName == null ? "" : deviceName.trim();
        return cleaned.isBlank() ? "Web browser" : cleaned;
    }

    private static void validatePasswordBytes(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Password must be at most 72 UTF-8 bytes.");
        }
    }

    private static String hashToken(String rawToken) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials or session.");
    }

    public record Session(
            PublicUser user,
            AccessToken accessToken,
            String refreshToken,
            Instant refreshTokenExpiresAt) {
    }

    public record RegistrationChallenge(String email, Instant expiresAt) {
    }

    public record PublicUser(UUID id, String email, String displayName) {
    }

    public record DeviceSummary(
            UUID id,
            String name,
            Instant lastSeenAt,
            long lastSyncCursor,
            boolean current) {
    }

    private record UserRow(UUID id, String email, String displayName, String passwordHash) {
        PublicUser toPublicUser() {
            return new PublicUser(id, email, displayName);
        }
    }

    private record DeviceRow(UUID userId, Instant revokedAt) {
    }

    private record RefreshRow(
            UUID id,
            UUID userId,
            UUID deviceId,
            UUID familyId,
            Instant expiresAt,
            Instant rotatedAt,
            Instant revokedAt) {
    }

    private record RefreshToken(UUID id, String rawValue, Instant expiresAt) {
    }

    private record PendingRegistrationRow(
            String email,
            String passwordHash,
            String displayName,
            String verificationCodeHash,
            UUID deviceId,
            String deviceName,
            int attempts,
            Instant expiresAt) {
    }
}
