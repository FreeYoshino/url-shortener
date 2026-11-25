import { IsUrl } from 'class-validator';

export class UpdateUrlDto {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Invalid URL format.' },
  )
  url: string;
}
