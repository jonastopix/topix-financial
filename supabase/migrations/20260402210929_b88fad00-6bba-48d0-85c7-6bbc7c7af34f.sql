
-- Fix old topix.lovable.app links in Rapport-påmindelse templates
UPDATE public.email_templates
SET body_html = REPLACE(REPLACE(body_html, 'https://topix.lovable.app', 'https://app.theboardroom.dk'), 'topix.dk</span>', 'theboardroom.dk</span>')
WHERE name IN ('Rapport-påmindelse (venlig)', 'Rapport-påmindelse (presserende)', 'Rapport-påmindelse (kritisk)');

-- Fix old links in notification templates
UPDATE public.email_templates
SET body_html = REPLACE(REPLACE(body_html, 'https://topix.lovable.app', 'https://app.theboardroom.dk'), 'topix.dk</span>', 'theboardroom.dk</span>')
WHERE name IN ('Notifikation: Pulse check-in modtaget', 'Notifikation: Ugens fokus klar');

-- Fix bad subject lines
UPDATE public.email_templates
SET subject = 'Ny rapport godkendt'
WHERE name = 'Notifikation: Rapport godkendt' AND subject = 'Nyt commit fra dit boardroom-medlem';

UPDATE public.email_templates
SET subject = 'Nyt pulse check-in modtaget'
WHERE name = 'Notifikation: Pulse check-in modtaget' AND subject = 'Nyt pulse check-in fra dit member';

-- Also fix the hardcoded h1 in the pulse check-in template body
UPDATE public.email_templates
SET body_html = REPLACE(body_html, 'Nyt pulse check-in fra dit member', 'Nyt pulse check-in modtaget')
WHERE name = 'Notifikation: Pulse check-in modtaget';
