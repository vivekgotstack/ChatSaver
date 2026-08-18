package dev.chatsaver.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

class SmtpEmailServiceTest {

    @Test
    void sendsBrandedHtmlVerificationCodeThroughSmtp() throws Exception {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(message);
        SmtpEmailService service = new SmtpEmailService(
                mailSender,
                "no-reply@chatsaver.local",
                "ChatSaver",
                "http://localhost:3000");

        service.sendVerificationCode("friend@example.com", "Alex <Admin>", "042731");

        verify(mailSender).send(message);
        message.saveChanges();
        assertThat(message.getSubject()).isEqualTo("042731 is your ChatSaver verification code");
        assertThat(message.getRecipients(Message.RecipientType.TO)[0].toString())
                .isEqualTo("friend@example.com");
        assertThat(message.getContentType()).contains("text/html");
        assertThat(message.getContent().toString())
                .contains("Welcome, Alex &lt;Admin&gt;")
                .contains("042731")
                .contains("http://localhost:3000/cs-transparent.png");
    }
}
