package dev.chatsaver.api.privatevault;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.chatsaver.api.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/v1/private-vault")
public class PrivateVaultController {
    private final PrivateVaultService service;

    public PrivateVaultController(PrivateVaultService service) {
        this.service = service;
    }

    @GetMapping
    Snapshot snapshot(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.snapshot(user.userId());
    }

    @PutMapping("/metadata")
    ResponseEntity<Void> putMetadata(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody Metadata request) {
        service.putMetadata(user.userId(), request);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/items/{clientId}")
    ResponseEntity<Void> putItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID clientId,
            @Valid @RequestBody Item request) {
        service.putItem(user.userId(), clientId, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/items/{clientId}/delete")
    ResponseEntity<Void> deleteItem(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID clientId,
            @Valid @RequestBody Deletion request) {
        service.deleteItem(user.userId(), clientId, request.deletedAt());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    ResponseEntity<Void> erase(@AuthenticationPrincipal AuthenticatedUser user) {
        service.erase(user.userId());
        return ResponseEntity.noContent().build();
    }

    public record Metadata(
            @NotBlank @Size(max = 128) String salt,
            @NotBlank @Size(max = 128) String verifierIv,
            @NotBlank @Size(max = 4096) String verifierCiphertext,
            @NotNull Instant createdAt,
            @NotNull Instant updatedAt) {
    }

    public record Item(
            @NotBlank @Size(max = 128) String iv,
            @NotBlank @Size(max = 32768) String ciphertext,
            @NotNull Instant createdAt,
            @NotNull Instant updatedAt) {
    }

    public record Deletion(@NotNull Instant deletedAt) {
    }

    public record StoredItem(UUID id, String iv, String ciphertext, Instant createdAt, Instant updatedAt) {
    }

    public record StoredDeletion(UUID id, Instant deletedAt) {
    }

    public record Snapshot(Metadata metadata, List<StoredItem> items, List<StoredDeletion> deleted) {
    }
}
