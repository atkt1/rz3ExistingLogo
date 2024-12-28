import { supabase } from '../supabase';
import { SurveyFormData } from '../types/survey';
import { optimizeImage } from '../utils/image';
import QRCode from 'qrcode';

interface CreateSurveyData extends Omit<SurveyFormData, 'logo'> {
  logo?: File;
  logoUrl?: string;
}

export async function createSurvey(data: CreateSurveyData, userId: string) {
  try {
    let logoPath = data.logoUrl || null;

    // Upload logo if provided and we don't have a logoUrl
    if (data.logo && !data.logoUrl) {
      const optimizedLogo = await optimizeImage(data.logo, 750 * 1024);
      const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('logos')
        .upload(`${userId}/${filename}`, optimizedLogo);

      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(uploadData.path);
      
      logoPath = publicUrl;
    }

    // Generate short code and URL
    const { data: shortCode, error: shortCodeError } = await supabase
      .rpc('generate_short_code');

    if (shortCodeError) throw shortCodeError;

    const surveyUrl = `https://reviewzone.ai/survey/${shortCode}`;
    
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(surveyUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'H'
    });

    // Create survey record
    const { data: survey, error: surveyError } = await supabase
      .from('surveys')
      .insert({
        survey_name: data.survey_name,
        survey_style: data.survey_style,
        minimum_review_length: data.minimum_review_length,
        minimum_star_rating: data.minimum_star_rating,
        time_delay: data.time_delay,
        logo_path: logoPath,
        user_id: userId,
        short_code: shortCode,
        url: surveyUrl,
        qr_code: qrCodeDataUrl,
        survey_status: 'ACTIVE'
      })
      .select()
      .single();

    if (surveyError) throw surveyError;

    // Create product associations
    const surveyProducts = data.product_ids.map(productId => ({
      survey_id: survey.id,
      product_id: productId
    }));

    const { error: productError } = await supabase
      .from('survey_products')
      .insert(surveyProducts);

    if (productError) throw productError;

    return survey;
  } catch (error) {
    console.error('Error creating survey:', error);
    throw error;
  }
}