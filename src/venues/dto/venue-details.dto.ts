import { ApiProperty } from '@nestjs/swagger';
import { Box } from '../../boxes/box.entity';
import { User } from '../../users/user.entity';
import { VenueMember } from '../venue-member.entity';
import { Venue } from '../venue.entity';

/** Только для документации Swagger: ответ GET /venues/:id */
export class VenueMemberWithUserDto extends VenueMember {
  @ApiProperty({ type: () => User })
  declare user: User;
}

export class VenueDetailsDto extends Venue {
  @ApiProperty({ type: [Box] })
  declare boxes: Box[];

  @ApiProperty({ type: [VenueMemberWithUserDto] })
  declare members: VenueMemberWithUserDto[];
}
