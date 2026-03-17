import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private authService: AuthService) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const request = context.switchToHttp().getRequest();
        const auth = request.headers['authorization'];


        if (!auth) throw new UnauthorizedException();

        const token = auth.replace('Bearer', '');
        const decoded = this.authService.verifyToken(token);

        if (!decoded) throw new UnauthorizedException();

        request.user = decoded;
        return true;
    }
}