package dev.chatsaver.api.auth;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.chatsaver.api.auth.AuthService.DeviceSummary;

@RestController
@RequestMapping("/api/v1/devices")
public class DeviceController {

    private final AuthService authService;

    public DeviceController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping
    List<DeviceSummary> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return authService.listDevices(user);
    }

    @DeleteMapping("/{deviceId}")
    ResponseEntity<Void> revoke(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID deviceId) {
        authService.revokeDevice(user, deviceId);
        return ResponseEntity.noContent().build();
    }
}
