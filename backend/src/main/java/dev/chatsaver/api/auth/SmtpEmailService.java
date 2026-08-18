package dev.chatsaver.api.auth;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
class SmtpEmailService {

    private final JavaMailSender mailSender;
    private final String senderEmail;
    private final String senderName;
    private final String logoUrl;

    SmtpEmailService(
            JavaMailSender mailSender,
            @Value("${chatsaver.email.sender-email}") String senderEmail,
            @Value("${chatsaver.email.sender-name}") String senderName,
            @Value("${chatsaver.web-origin}") String webOrigin) {
        this.mailSender = mailSender;
        this.senderEmail = senderEmail.trim();
        this.senderName = senderName.trim();
        this.logoUrl = webOrigin.replaceAll("/$", "") + "/cs-transparent.png";
    }

    void sendVerificationCode(String recipientEmail, String displayName, String code) {
        String greeting = displayName == null || displayName.isBlank()
                ? "Welcome to ChatSaver"
                : "Welcome, " + escapeHtml(displayName.trim());
        MimeMessage message = mailSender.createMimeMessage();

        try {
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(senderEmail, senderName);
            helper.setTo(recipientEmail);
            helper.setSubject(code + " is your ChatSaver verification code");
            helper.setText(html(greeting, code), true);
            mailSender.send(message);
        } catch (MessagingException | UnsupportedEncodingException | MailException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "SMTP could not send the verification email.",
                    exception);
        }
    }

    private String html(String greeting, String code) {
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
                        <p style="font-size:15px;line-height:1.7;color:#bdaeb0;margin:0 0 24px">Enter this code in ChatSaver to verify your email and create your cloud library.</p>
                        <div style="padding:20px;border:1px solid #6f2635;border-radius:16px;background:#220c11;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#fff8ed">%s</div>
                        <p style="font-size:12px;line-height:1.6;color:#8f8083;margin:20px 0 0">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
                      </div>
                    </div>
                  </div>
                </body></html>
                """.formatted(logoUrl, greeting, code);
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
