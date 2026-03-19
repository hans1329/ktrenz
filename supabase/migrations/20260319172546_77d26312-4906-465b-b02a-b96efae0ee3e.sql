-- Create storage bucket for trend thumbnail images
INSERT INTO storage.buckets (id, name, public) VALUES ('trend-images', 'trend-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Trend images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'trend-images');

-- Allow service role to upload (edge functions use service role)
CREATE POLICY "Service role can upload trend images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'trend-images');

CREATE POLICY "Service role can update trend images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'trend-images');
