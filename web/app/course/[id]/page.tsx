import { CourseReader } from '@/components/course/CourseReader';
import { I18nProvider } from '@/lib/hooks/use-i18n';

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CourseReaderPage({ params }: Params) {
  const { id } = await params;
  return (
    <I18nProvider>
      <CourseReader courseId={id} />
    </I18nProvider>
  );
}
