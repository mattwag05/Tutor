interface StudentProfileInput {
  userNickname?: string | null;
  userBio?: string | null;
}

export function formatStudentProfile(
  input: StudentProfileInput,
  style: 'block' | 'inline' = 'block',
): string {
  const { userNickname, userBio } = input;
  if (!userNickname && !userBio) return '';

  const line = `Student: ${userNickname || 'Unknown'}${userBio ? ` — ${userBio}` : ''}`;
  if (style === 'inline') return line;

  return `## Student Profile\n\n${line}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`;
}
