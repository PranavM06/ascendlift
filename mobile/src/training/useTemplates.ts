import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTemplate,
  deleteTemplate,
  fetchTemplate,
  fetchTemplates,
  replaceTemplate,
  type TemplateContent,
} from '@/src/api/templates';

/** Every template query's key starts with this, so one call can refresh them all. */
export const TEMPLATES_QUERY_KEY = ['templates'] as const;

export function useTemplates() {
  return useQuery({ queryKey: [...TEMPLATES_QUERY_KEY, 'list'], queryFn: fetchTemplates });
}

/** One template. Given null, such as for a blank workout, it loads nothing. */
export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: [...TEMPLATES_QUERY_KEY, 'detail', templateId],
    queryFn: () => fetchTemplate(templateId ?? ''),
    enabled: templateId !== null,
  });
}

/** Creates the template, or replaces the one whose id is given. */
export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, content }: { templateId: string | null; content: TemplateContent }) =>
      templateId === null ? createTemplate(content) : replaceTemplate(templateId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY }),
  });
}
