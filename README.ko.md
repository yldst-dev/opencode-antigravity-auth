# Antigravity OAuth Plugin for OpenCode

[English](README.md) | **한국어**

[![npm version](https://img.shields.io/npm/v/yldst-opencode-antigravity-auth.svg)](https://www.npmjs.com/package/yldst-opencode-antigravity-auth)
[![npm downloads](https://img.shields.io/npm/dw/yldst-opencode-antigravity-auth.svg)](https://www.npmjs.com/package/yldst-opencode-antigravity-auth)

Google 계정으로 OAuth 인증하여 **Claude Opus 4.6**, **Opus 4.5**, **Sonnet 4.5**, **Gemini 3 Pro/Flash** 모델을 OpenCode에서 사용할 수 있게 해주는 플러그인입니다.

---

## 주요 기능

- **Claude & Gemini 모델** - Google OAuth로 Antigravity 할당량 사용
- **다중 계정 지원** - 여러 계정 추가, 레이트 리밋 시 자동 전환
- **이중 할당량** - Antigravity + Gemini CLI 할당량 동시 사용
- **Quota Guard** - 할당량 5% 이하 시 자동으로 다른 계정으로 전환
- **자동 복구** - 세션 오류 및 도구 실패 자동 처리

---

## 설치

### 1. 플러그인 추가

`~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["yldst-opencode-antigravity-auth@latest"]
}
```

### 2. 로그인

```bash
opencode auth login
```

### 3. 모델 정의 추가

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["yldst-opencode-antigravity-auth@latest"],
  "provider": {
    "google": {
      "models": {
        "antigravity-gemini-3-pro": {
          "name": "Gemini 3 Pro (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "minimal": { "thinkingLevel": "minimal" },
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5 (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-claude-opus-4-5-thinking": {
          "name": "Claude Opus 4.5 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "gemini-2.5-flash": {
          "name": "Gemini 2.5 Flash (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-3-flash-preview": {
          "name": "Gemini 3 Flash Preview (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "gemini-3-pro-preview": {
          "name": "Gemini 3 Pro Preview (Gemini CLI)",
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    }
  }
}
```

### 4. 사용

```bash
opencode run "Hello" --model=google/antigravity-claude-sonnet-4-5-thinking --variant=max
```

---

## 다중 계정 설정

여러 Google 계정을 추가하여 할당량을 늘릴 수 있습니다. 레이트 리밋 시 자동으로 다른 계정으로 전환됩니다.

```bash
opencode auth login  # 다시 실행하여 계정 추가
```

---

## Quota Guard 설정

할당량이 5% 이하로 떨어지면 자동으로 다른 계정으로 전환하여 429 오류와 2일 대기 패널티를 방지합니다.

`~/.config/opencode/antigravity.json`:

```json
{
  "quota_guard": {
    "enabled": true,
    "switchRemainingPercent": 5,
    "cooldownMinutes": 300
  }
}
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `enabled` | `true` | Quota Guard 활성화 |
| `switchRemainingPercent` | `5` | 이 % 이하로 떨어지면 계정 전환 |
| `cooldownMinutes` | `300` | 쿨다운 시간 (5시간) |
| `waitWhenNoAccount` | `true` | 사용 가능한 계정 없을 때 대기 |
| `waitPollSeconds` | `30` | 대기 중 폴링 간격 |
| `maxWaitSeconds` | `0` | 최대 대기 시간 (0 = 무제한) |

---

## 문제 해결

### 빠른 리셋

대부분의 문제는 계정 파일을 삭제하고 재인증하면 해결됩니다:

```bash
rm ~/.config/opencode/antigravity-accounts.json
opencode auth login
```

### 설정 파일 경로

| 파일 | 경로 |
|------|------|
| 메인 설정 | `~/.config/opencode/opencode.json` |
| 계정 | `~/.config/opencode/antigravity-accounts.json` |
| 플러그인 설정 | `~/.config/opencode/antigravity.json` |

### 403 Permission Denied

**원인:** Gemini CLI 모델 사용 시 프로젝트 ID가 필요합니다.

**해결:**
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. **Gemini for Google Cloud API** 활성화
3. `antigravity-accounts.json`에 `projectId` 추가

### 디버그 모드

```bash
OPENCODE_ANTIGRAVITY_DEBUG=1 opencode
```

---

## 문서

- [Configuration](docs/CONFIGURATION.md) - 전체 설정 옵션
- [Multi-Account](docs/MULTI-ACCOUNT.md) - 다중 계정 가이드
- [Troubleshooting](docs/TROUBLESHOOTING.md) - 문제 해결

---

## 라이선스

MIT License. [LICENSE](LICENSE) 참조.

> **주의:** 이 플러그인 사용은 Google 서비스 약관에 위배될 수 있습니다. 계정 정지 위험이 있으니 주의하세요.
