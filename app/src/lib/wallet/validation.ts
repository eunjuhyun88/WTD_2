// Wallet modal form validation utilities

function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed.includes('@')) {
    return 'Valid email required';
  }
  if (trimmed.length > 254) {
    return 'Email is too long';
  }
  return null;
}

function validateNickname(nickname: string, required: boolean = false): string | null {
  const trimmed = nickname.trim();
  if (!trimmed && !required) {
    return null;
  }
  if (trimmed.length < 2) {
    return 'Nickname must be 2+ characters';
  }
  if (trimmed.length > 32) {
    return 'Nickname must be 32 characters or less';
  }
  return null;
}

export function parseSignupInput(email: string, nickname: string): { error: string | null; data: { email: string; nickname: string } | null } {
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, data: null };

  const nicknameError = validateNickname(nickname, true);
  if (nicknameError) return { error: nicknameError, data: null };

  return {
    error: null,
    data: {
      email: email.trim(),
      nickname: nickname.trim(),
    },
  };
}

export function parseLoginInput(email: string, nickname: string): { error: string | null; data: { email: string; nickname?: string } | null } {
  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, data: null };

  const nicknameError = validateNickname(nickname, false);
  if (nicknameError) return { error: nicknameError, data: null };

  const trimmedNickname = nickname.trim();
  return {
    error: null,
    data: trimmedNickname
      ? { email: email.trim(), nickname: trimmedNickname }
      : { email: email.trim() },
  };
}
