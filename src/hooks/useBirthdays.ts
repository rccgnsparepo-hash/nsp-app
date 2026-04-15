import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BirthdayProfile {
  id: string;
  full_name: string;
  profile_image_url: string | null;
  date_of_birth: string;
  daysUntil: number;
}

export const useBirthdays = () => {
  return useQuery({
    queryKey: ['birthdays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, profile_image_url, date_of_birth')
        .not('date_of_birth', 'is', null);
      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const withDays = (data as any[]).map((p) => {
        const dob = new Date(p.date_of_birth);
        const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (thisYear < today) thisYear.setFullYear(thisYear.getFullYear() + 1);
        const diff = Math.ceil((thisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...p, daysUntil: diff } as BirthdayProfile;
      });

      withDays.sort((a, b) => a.daysUntil - b.daysUntil);
      return withDays;
    },
  });
};
