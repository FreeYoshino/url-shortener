import { IsUrl } from 'class-validator';

export class UpdateUrlDto {
  @IsUrl({ require_protocol: true }, { message: 'Invalid URL format.' })
  url: string;
}
