CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own incoming or sent messages"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (auth.uid() = recipient_id OR auth.uid() = sender_id);

CREATE POLICY "Users can send messages"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipients can mark read"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id);

CREATE POLICY "Senders or recipients can delete"
ON public.direct_messages
FOR DELETE
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE INDEX idx_direct_messages_recipient ON public.direct_messages(recipient_id, created_at DESC);