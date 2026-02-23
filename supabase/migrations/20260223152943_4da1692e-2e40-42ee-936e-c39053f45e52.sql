
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('member', 'advisor');

-- User roles table (must be first, before has_role function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Security definer function for role checking (before any policy uses it)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  company_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Advisors can view all profiles" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'advisor')
);

-- Conversations table (one per member)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own conversation" ON public.conversations FOR SELECT USING (auth.uid() = member_id);
CREATE POLICY "Advisors can view all conversations" ON public.conversations FOR SELECT USING (public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Members can create own conversation" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = member_id);
CREATE POLICY "Advisors can update conversations" ON public.conversations FOR UPDATE USING (public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Members can update own conversation" ON public.conversations FOR UPDATE USING (auth.uid() = member_id);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND member_id = auth.uid())
);
CREATE POLICY "Advisors can view all messages" ON public.messages FOR SELECT USING (public.has_role(auth.uid(), 'advisor'));
CREATE POLICY "Members can insert in own conversation" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND member_id = auth.uid())
);
CREATE POLICY "Advisors can insert messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND public.has_role(auth.uid(), 'advisor')
);
CREATE POLICY "Advisors can update messages" ON public.messages FOR UPDATE USING (public.has_role(auth.uid(), 'advisor'));

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.conversations (member_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update last_message_at
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- Timestamp triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
