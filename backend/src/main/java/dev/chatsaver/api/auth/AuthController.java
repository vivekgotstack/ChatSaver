package dev.chatsaver.api.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.chatsaver.api.auth.AuthService.PublicUser;
import dev.chatsaver.api.auth.AuthService.RegistrationChallenge;
import dev.chatsaver.api.auth.AuthService.Session;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final String REFRESH_COOKIE = "chatsaver_refresh";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final boolean secureCookies;

    public AuthController(
            AuthService authService,
            @Value("${chatsaver.auth.secure-cookies}") boolean secureCookies) {
        this.authService = authService;
        this.secureCookies = secureCookies;
    }

    @PostMapping("/register/request")
    ResponseEntity<RegistrationChallenge> requestRegistration(
            @Valid @RequestBody RegisterRequest request) {
        RegistrationChallenge challenge = authService.requestRegistration(
                request.email(),
                request.password(),
                request.displayName(),
                request.deviceId(),
                request.deviceName());
        return ResponseEntity.accepted().body(challenge);
    }

    @PostMapping("/register/verify")
    ResponseEntity<AuthResponse> verifyRegistration(
            @Valid @RequestBody VerifyRegistrationRequest request) {
        return sessionResponse(authService.verifyRegistration(request.email(), request.code()));
    }

    @PostMapping("/login")
    ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        Session session = authService.login(
                request.email(),
                request.password(),
                request.deviceId(),
                request.deviceName());
        return sessionResponse(session);
    }

    @PostMapping("/password-reset/request")
    ResponseEntity<RegistrationChallenge> requestPasswordReset(
            @Valid @RequestBody PasswordResetRequest request) {
        return ResponseEntity.accepted().body(
                authService.requestPasswordReset(request.email(), request.password()));
    }

    @PostMapping("/password-reset/verify")
    ResponseEntity<Void> verifyPasswordReset(
            @Valid @RequestBody VerifyPasswordResetRequest request) {
        authService.verifyPasswordReset(request.email(), request.code());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/refresh")
    ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        return sessionResponse(authService.refresh(refreshToken));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        authService.logout(refreshToken);
        ResponseCookie expiredCookie = cookie("", Instant.EPOCH);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, expiredCookie.toString())
                .build();
    }

    private ResponseEntity<AuthResponse> sessionResponse(Session session) {
        ResponseCookie refreshCookie = cookie(
                session.refreshToken(),
                session.refreshTokenExpiresAt());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(new AuthResponse(
                        session.user(),
                        session.accessToken().value(),
                        session.accessToken().expiresAt()));
    }

    private ResponseCookie cookie(String value, Instant expiresAt) {
        long seconds = Math.max(0, Duration.between(Instant.now(), expiresAt).toSeconds());
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookies)
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(Duration.ofSeconds(seconds))
                .build();
    }

    record RegisterRequest(
            @Email @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 72) String password,
            @Size(max = 160) String displayName,
            @NotNull UUID deviceId,
            @Size(max = 160) String deviceName) {
    }

    record LoginRequest(
            @Email @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(max = 72) String password,
            @NotNull UUID deviceId,
            @Size(max = 160) String deviceName) {
    }

    record VerifyRegistrationRequest(
            @Email @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(min = 6, max = 6) String code) {
    }

    record PasswordResetRequest(
            @Email @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 72) String password) {
    }

    record VerifyPasswordResetRequest(
            @Email @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(min = 6, max = 6) String code) {
    }

    record AuthResponse(PublicUser user, String accessToken, Instant expiresAt) {
    }
}
