package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.chatsaver.api.auth.AuthenticatedUser;
import dev.chatsaver.api.integration.IntegrationModels.CompletedConnection;
import dev.chatsaver.api.integration.IntegrationModels.ConnectLink;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationConnection;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationDefinition;
import dev.chatsaver.api.integration.IntegrationModels.ToolExecutionResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/v1/integrations")
public final class IntegrationController {

    private final IntegrationService integrations;

    IntegrationController(IntegrationService integrations) {
        this.integrations = integrations;
    }

    @GetMapping
    List<IntegrationDefinition> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return integrations.listIntegrations(user.userId());
    }

    @GetMapping("/connections")
    List<IntegrationConnection> connections(@AuthenticationPrincipal AuthenticatedUser user) {
        return integrations.listConnections(user.userId());
    }

    @PostMapping("/{toolkit}/connect")
    ConnectLink connect(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable @Size(max = 48) String toolkit) {
        return integrations.connect(user.userId(), toolkit);
    }

    @PostMapping("/callback/complete")
    CompletedConnection complete(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody CompleteAuthenticationRequest request) {
        return integrations.completeAuthentication(user.userId(), request.sessionUri());
    }

    @DeleteMapping("/connections/{connectionId}")
    ResponseEntity<Void> disconnect(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable @Size(max = 128) String connectionId) {
        integrations.disconnect(user.userId(), connectionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/connections/{connectionId}/execute")
    ToolExecutionResult execute(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable @Size(max = 128) String connectionId,
            @Valid @RequestBody ExecuteRequest request) {
        return integrations.execute(
                user.userId(),
                connectionId,
                request.action(),
                request.input() == null ? Map.of() : request.input());
    }

    record CompleteAuthenticationRequest(
            @NotBlank @Size(max = 2048) String sessionUri) {
    }

    record ExecuteRequest(
            @NotBlank @Size(max = 64) String action,
            Map<String, Object> input) {
    }
}
