package dev.chatsaver.api.auth;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Service
class BrevoEmailService {

    private static final URI BREVO_EMAIL_ENDPOINT = URI.create("https://api.brevo.com/v3/smtp/email");

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String senderEmail;
    private final String senderName;
    private final String logoUrl;

    BrevoEmailService(
            ObjectMapper objectMapper,
            @Value("${chatsaver.email.brevo-api-key:}") String apiKey,
            @Value("${chatsaver.email.sender-email:}") String senderEmail,
            @Value("${chatsaver.email.sender-name:ChatSaver}") String senderName,
            @Value("${chatsaver.web-origin}") String webOrigin) {
        this.objectMapper = objectMapper;
        this.apiKey = apiKey.trim();
        this.senderEmail = senderEmail.trim();
        this.senderName = senderName.trim();
        this.logoUrl = webOrigin.replaceAll("/$", "") + "/cs-transparent.png";
    }

    void sendVerificationCode(String recipientEmail, String displayName, String code) {
        String greeting = displayName == null || displayName.isBlank()
                ? "Welcome to ChatSaver"
                : "Welcome, " + escapeHtml(displayName.trim());
        sendCode(recipientEmail, code, greeting,
                code + " is your ChatSaver verification code",
                "Enter this code in ChatSaver to verify your email and create your cloud library.",
                "chatsaver-signup-verification");
    }

    void sendPasswordResetCode(String recipientEmail, String displayName, String code) {
        String greeting = displayName == null || displayName.isBlank()
                ? "Reset your ChatSaver password"
                : "Reset your password, " + escapeHtml(displayName.trim());
        sendCode(recipientEmail, code, greeting,
                code + " is your ChatSaver password reset code",
                "Enter this code in ChatSaver to set your new password. All previous sessions will be signed out.",
                "chatsaver-password-reset");
    }

    private void sendCode(
            String recipientEmail,
            String code,
            String greeting,
            String subject,
            String message,
            String tag) {
        if (apiKey.isBlank() || senderEmail.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Email verification is not configured yet.");
        }

        Map<String, Object> payload = Map.of(
                "sender", Map.of("name", senderName, "email", senderEmail),
                "to", new Object[] { Map.of("email", recipientEmail) },
                "subject", subject,
                "htmlContent", html(greeting, message, code),
                "tags", new String[] { tag });

        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(BREVO_EMAIL_ENDPOINT)
                    .timeout(Duration.ofSeconds(15))
                    .header("accept", "application/json")
                    .header("api-key", apiKey)
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not prepare the verification email.", exception);
        }

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Brevo could not send the verification email.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Verification email delivery was interrupted.",
                    exception);
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Brevo could not be reached to send the verification email.",
                    exception);
        }
    }

    private String html(String greeting, String message, String code) {
        return """
                <!doctype html>
                <html><body style="margin:0;background:#080506;color:#f7efe1;font-family:Arial,sans-serif">
                  <div style="padding:36px 16px">
                    <div style="max-width:520px;margin:auto;overflow:hidden;border:1px solid #3a2328;border-radius:24px;background:linear-gradient(145deg,#160d10,#090607);box-shadow:0 24px 70px rgba(0,0,0,.42)">
                      <div style="height:3px;background:linear-gradient(90deg,transparent,#dc1838,transparent)"></div>
                      <div style="padding:34px">
                        <img src="%s" width="54" height="54" alt="ChatSaver" style="display:block;border:0;margin-bottom:22px">
                        <div style="font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:#c68e96;margin-bottom:12px">Secure cloud vault</div>
                        <h1 style="font-size:27px;line-height:1.15;margin:0 0 12px;color:#fff8ed">%s</h1>
                        <p style="font-size:15px;line-height:1.7;color:#bdaeb0;margin:0 0 24px">%s</p>
                        <div style="padding:20px;border:1px solid #6f2635;border-radius:16px;background:#220c11;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#fff8ed">%s</div>
                        <p style="font-size:12px;line-height:1.6;color:#8f8083;margin:20px 0 0">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
                      </div>
                    </div>
                  </div>
                </body></html>
                """.formatted(logoUrl, greeting, message, code);
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
