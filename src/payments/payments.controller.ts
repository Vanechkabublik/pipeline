import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { WebhookDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('bookings/:id/pay')
  @UseGuards(AuthGuard('jwt'))
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.paymentsService.create(user.id, id);
  }

  @Post('payments/webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string,
    @Body() dto: WebhookDto,
  ) {
    // Считаем подпись от сырого тела и сравниваем с присланной
    if (signature !== this.paymentsService.sign(req.rawBody!)) {
      throw new UnauthorizedException('Неверная подпись');
    }
    return this.paymentsService.handleWebhook(dto);
  }

  // Имитация оплаты для проверки через Swagger. В production выключено.
  @Post('payments/dev/simulate/:paymentId')
  @HttpCode(200)
  simulate(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() req: Request,
  ) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.paymentsService.simulate(
      paymentId,
      `${req.protocol}://${req.get('host')}`,
    );
  }
}
